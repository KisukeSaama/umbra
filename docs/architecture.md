# Architecture

## Shape

One Next.js application, one Postgres database, one worker calling a sync endpoint
on a loop. No separate API service: keeping the number of moving parts down is the
main constraint of a personal project.

```
browser -> Traefik -> Next.js -> PostgreSQL
                      (server components and /api routes both call the domain)
                              -> Janus gateway -> kisuflix (Plex), tmdb-v3
worker (same image) -> POST /api/cron/sync
```

## Layers

| Directory                              | Holds                                     | Never holds             |
| -------------------------------------- | ----------------------------------------- | ----------------------- |
| `src/app/(site)`, `src/app/admin`      | pages, layout, gating                     | business rules          |
| `src/app/api`                          | validation, rate limiting, authorisation  | SQL                     |
| `src/lib/domain`                       | business rules and queries                | HTTP details            |
| `src/lib/discovery`, `src/lib/reports` | pure rules, unit tested                   | database or network     |
| `src/lib/providers`                    | integration contracts and implementations | domain rules            |
| `src/lib/jobs`                         | scheduled work                            | anything not idempotent |

Reads happen in server components calling the domain layer directly. Writes go
through `src/app/api`, so there is exactly one place where a request is checked
before it touches the domain.

## Integrations

Two contracts, so adding TVDB later or moving to another media server is one new
implementation rather than a rewrite. Domain code only ever sees the contract.

- `MediaMetadataProvider` (`src/lib/providers/metadata.ts`), implemented by
  `tmdbProvider`: search, details, seasons, episodes, and the shelf listings
  (trending, discover, upcoming, recommendations, genres).
- `MediaLibraryProvider` (`src/lib/providers/library.ts`), implemented by
  `plexLibrary`: sections, items, episodes, recently added, and one account watch
  history that returns keys and a kind and nothing else.

`src/lib/janus.ts` is the only place that talks to the outside world, setting the
two gateway headers once and never at a call site. Janus holds the API secrets, so
Umbra carries no TMDB key and no Plex token, and it provides the response cache,
retries, backoff, circuit breaking and quotas, which is why none of those exist
here. On a refusal, Umbra logs the correlation id and returns a generic upstream
error.

Plex answers in XML and Janus converts it to JSON. The conversion can leave
attributes bare or prefixed with `@`, so the parser in
`src/lib/providers/plex.ts` accepts both rather than betting on one shape.

Posters come from the public TMDB image CDN, never proxied from the media server:
that keeps the media server invisible to browsers and avoids a binary proxy.
Library entries get their poster path filled in by a capped enrichment pass after
each sync.

## Data model

| Table                                         | Holds                                                             |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `account`                                     | a Plex account id, a name, a role, a status                       |
| `session`                                     | a session digest and its expiry                                   |
| `auth_pin`                                    | a plex.tv pin being confirmed, short-lived                        |
| `media`                                       | a title Umbra knows about, because it was requested or is tracked |
| `library_item`                                | the local index of the server library                             |
| `media_request`                               | a request and its status                                          |
| `tracked_series`                              | a series under watch, and its key on the server                   |
| `episode`                                     | the broadcast calendar, and presence on the server                |
| `episode_task`                                | an aired episode that is still missing                            |
| `report`, `report_follower`                   | a problem a member pointed at, and who is waiting on it           |
| `notification`                                | what a member has been told, as data rather than as a sentence    |
| `taste_profile`                               | a few weighted genre ids per account, replaced on every run       |
| `announcement`, `poll`, `poll_option`, `vote` | community                                                         |
| `storage_snapshot`                            | a storage measurement, with per-volume detail                     |
| `funding_goal`, `funding_transaction`         | the goal and its manual history                                   |
| `job_state`, `job_run`                        | resume point and run history                                      |
| `analytics_daily`                             | daily counters, with no account column                            |

Uniqueness lives in the database, never in a read-then-write:

- `media_request_active_idx`, partial unique on `media_id` where the status is not
  `rejected`: two simultaneous clicks cannot create two live requests, and the
  failed insert is turned into "already requested".
- `vote_unique_idx` on `(poll_id, account_id)`: one vote per person per poll.
- `episode_unique_idx` on `(series_id, season_number, episode_number)`: a resync
  updates instead of duplicating.
- `funding_goal_single_active_idx`: one active goal at a time.
- `report_active_idx`, partial unique on
  `(media_id, coalesce(season_number, -1), coalesce(episode_number, -1), reason)`
  where the status is still live. The `coalesce` is not decoration: two NULLs
  never collide in Postgres, so without it "the whole series" would duplicate on
  every click. The query builder cannot name an expression as a conflict target,
  which is why creating a report is one hand-written statement.
- `notification_unique_idx` on `(account_id, dedup_key)`. The key spells the
  subject and the step it announces, so a fan-out can be replayed with
  `ON CONFLICT DO NOTHING` and a request going accepted then available says both
  things rather than only the first.

`library_item` is an index, not a cache of the media server API: it is what lets a
search answer "already available" in one query instead of asking the server per
result.

## Jobs

`runSyncCycle()` in `src/lib/jobs/index.ts` runs six steps in dependency order,
each recorded in `job_run` and stamped in `job_state` on success. A failing step
does not stop the others: a metadata outage must not prevent a storage snapshot.

1. **library-sync**: pull sections, items and episodes; upsert on the server key;
   drop entries of that section not seen in this pass; link tracked series to
   their server entry; close requests and missing-episode reports whose title has
   appeared; fill in missing posters and genres.
2. **series-sync**: refresh the calendar of series due for a resync.
3. **episode-reconcile**: mark episodes available or missing, raise tasks, close
   tasks whose episode arrived, then settle the season and series reports the
   refreshed calendar can now answer.
4. **storage-snapshot**: measure the configured volumes and record a point.
5. **taste-profile**: rebuild each opted-in account profile from a rolling window
   of the media server history, replacing the rows rather than adding to them.
6. **housekeeping**: delete what nothing else deletes, bounded per run so a
   backlog drains over several passes: expired sessions and pins, old job runs,
   read notifications past a month and everything past six.

The sweep in library-sync is scoped to the section that just answered, and only
when it answered with something. A section whose storage is not mounted comes
back empty without failing, and a sweep over the whole table would then erase it,
taking every request and report attached to those titles with it.

Reconciliation compares dates against now rather than reacting to an event, so
nothing is missed after downtime, and `ON CONFLICT DO NOTHING` on the task means a
rerun never duplicates work. A large catch-up lands as a batch of tasks rather
than being lost. The worker holds no state: it calls the endpoint, and the
endpoint knows what is left to do.

## Authentication

Plex PIN sign-in, through Janus. Umbra opens a pin and stores its id, so the
confirmation step cannot be pointed at an arbitrary pin; the visitor confirms on
plex.tv; Umbra polls, receives a Plex token, reads the account id with it, and
drops the token, which is never stored and never logged; a session token is set in
an `HttpOnly` cookie and only its SHA-256 digest is stored.

A new account lands as `pending` unless it is the designated administrator or
`AUTO_APPROVE_MEMBERS` is on. A blocked account stays blocked whatever the
configuration says.

`plex.tv` has to be registered in Janus by the operator. Until then the sign-in
route is refused by the gateway, which is expected, and `DEV_LOGIN` covers local
work.

## Security

- No third-party API secret in the repository, and none in the browser.
- Every input validated with Zod at the route boundary.
- Rate limiting on writes and on search, keyed by account. Anonymous buckets
  (sign-in pins, language) are keyed by the address the edge vouches for
  (`CF-Connecting-IP`, then `X-Real-IP`), never by `X-Forwarded-For` alone, and
  paired with a global cap.
- Cross-site request forgery: the session cookie is `SameSite=Lax`, and
  `src/proxy.ts` refuses any mutation under `/api` whose `Origin` or
  `Sec-Fetch-Site` names another site.
- Access is checked in every page, not only in the layout above it: a layout does
  not stop the page under it from rendering and is not re-run on a client-side
  navigation. `requireMemberPage` and `requireAdminPage` redirect, `requireMember`
  and `requireAdmin` throw. Blocking or demoting an account ends its sessions at
  once.
- Shared secrets (`CRON_SECRET`, the administrator Plex id) are compared in
  constant time.
- Content Security Policy, `Permissions-Policy` and HSTS on every response; the
  only external origin the browser may reach is the TMDB image CDN.
- Errors return a stable code and a `messageKey`; internal detail stays in logs.
- Storage paths come from configuration only. No endpoint takes a path, and
  nothing on the machine is ever executed.
- The container runs unprivileged, read-only, with capabilities dropped.
- `noindex` in the metadata, in `robots.txt`, in a Next response header and in a
  Traefik header: a private hub does not belong in an index.

## Interface

Server components by default; client components only where there is interaction
(search, vote, sign-in, reporting, admin writes).

A title has its own route, `/title/[kind]/[id]`. Clicked from a shelf it is
intercepted by the `@modal` slot and opens as a panel over what you were reading;
reached from a link it renders as a page. Same address either way, so it can be
shared and it comes back through history.

Discovery shelves each stream inside their own `Suspense` boundary. That is not a
performance trick: the gateway can refuse one listing, and this way it costs a
rail rather than the page. Nothing here caches a provider response, because Janus
owns that; `React.cache()` only deduplicates the same call inside one render.

Appearance follows the operating system and
language follows the browser (`Accept-Language`, resolved once per request and
passed down through a provider), each with an override in the account menu: the
language override is a plain cookie set through `/api/locale`, for the visitor
whose browser speaks a language they do not.

Wording lives in `src/lib/i18n/dictionaries.ts`, where `fr` is typed against `en`,
so a missing translation is a compile error rather than a blank label. Visual
rules are in [DESIGN.md](DESIGN.md).
