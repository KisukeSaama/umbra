# Architecture

## Shape

One Next.js application, one Postgres database, one worker that calls a sync
endpoint on a loop. No separate API service: the number of moving parts is the
main thing a personal project has to keep down.

```
                     browser
                        |  HTTPS (Traefik)
                        v
        +-------------------------------+
        |  Next.js                      |
        |  server components -> domain  |
        |  /api routes       -> domain  |
        +---------------+---------------+
                        |
        +---------------+---------------+
        |               |               |
        v               v               v
   PostgreSQL      Janus gateway     worker
                    |         |     (same image,
                    v         v      loops on /api/cron/sync)
                 kisuflix   tmdb-v3
                 (Plex)     (metadata)
```

## Layers

| Directory                         | Holds                                     | Never holds             |
| --------------------------------- | ----------------------------------------- | ----------------------- |
| `src/app/(site)`, `src/app/admin` | pages, layout, gating                     | business rules          |
| `src/app/api`                     | validation, rate limiting, authorisation  | SQL                     |
| `src/lib/domain`                  | business rules and queries                | HTTP details            |
| `src/lib/providers`               | integration contracts and implementations | domain rules            |
| `src/lib/jobs`                    | scheduled work                            | anything not idempotent |

Reads happen in server components calling the domain layer directly. Writes go
through `src/app/api`, so there is exactly one place where a request is checked
before it touches the domain.

## Integrations

Two contracts:

- `MediaMetadataProvider` (`src/lib/providers/metadata.ts`), implemented by
  `tmdbProvider`. Search, details, seasons, episodes.
- `MediaLibraryProvider` (`src/lib/providers/library.ts`), implemented by
  `plexLibrary`. Sections, items, episodes, recently added.

Domain code only ever sees the contract, so adding TVDB later, or moving to
another media server, is one new implementation rather than a rewrite.

### Everything goes through Janus

`src/lib/janus.ts` is the only place that talks to the outside world. It sets
the two gateway headers once and never at a call site. Janus holds the API
secrets, so Umbra carries no TMDB key and no Plex token.

Janus also provides the response cache, retries, backoff, circuit breaking and
quotas, which is why none of those exist in this codebase. On a refusal, Umbra
logs the correlation id and returns a generic upstream error.

The Plex API answers in XML; Janus converts it to JSON. The conversion can leave
attributes bare or prefixed with `@`, so the parser in
`src/lib/providers/plex.ts` accepts both rather than betting on one shape.

### Posters

Posters are served from the public TMDB image CDN, never proxied from the media
server. That keeps the media server invisible to browsers and avoids a binary
proxy. Library entries get their poster path filled in by a capped enrichment
pass after each sync.

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
| `announcement`, `poll`, `poll_option`, `vote` | community                                                         |
| `storage_snapshot`                            | a storage measurement, with per-volume detail                     |
| `funding_goal`, `funding_transaction`         | the goal and its manual history                                   |
| `job_state`, `job_run`                        | resume point and run history                                      |
| `analytics_daily`                             | daily counters, with no account column                            |

Uniqueness lives in the database:

- `media_request_active_idx` is a partial unique index on `media_id` where the
  status is not `rejected`. Two people clicking at the same time cannot create
  two live requests; the second insert fails and is turned into "already
  requested".
- `vote_unique_idx` on `(poll_id, account_id)`: one vote per person per poll.
- `episode_unique_idx` on `(series_id, season_number, episode_number)`: a resync
  updates instead of duplicating.
- `funding_goal_single_active_idx`: one active goal at a time.

`library_item` is not a cache of the media server API, it is an index: it is
what lets a search answer "already available" in one query instead of asking the
server per result.

## Jobs

`runSyncCycle()` in `src/lib/jobs/index.ts` runs four steps in dependency order,
each recorded in `job_run` and stamped in `job_state` on success. A failing step
does not stop the others: a metadata outage must not prevent a storage snapshot.

1. **library-sync**: pull sections, items and episodes; upsert on the server key;
   drop entries not seen in this pass; link tracked series to their server entry;
   close requests whose title has appeared; fill in missing posters.
2. **series-sync**: refresh the calendar of series due for a resync.
3. **episode-reconcile**: mark episodes available or missing, raise tasks, close
   tasks whose episode arrived, notify once per episode.
4. **storage-snapshot**: measure the configured volumes and record a point.

### Catching up after downtime

Reconciliation compares dates against now rather than reacting to an event, so
there is nothing to miss. An episode that aired while Umbra was down is picked
up on the next run, and `ON CONFLICT DO NOTHING` on the task means a rerun never
duplicates work. A large catch-up sends one summary notification instead of
fifty messages.

The worker holds no state at all: it calls the endpoint, and the endpoint knows
what is left to do.

## Authentication

Plex PIN sign-in, through Janus:

1. Umbra opens a pin and stores its id, so the confirmation step cannot be
   pointed at an arbitrary pin.
2. The visitor confirms on plex.tv.
3. Umbra polls, receives a Plex token, reads the account id with it, and drops
   the token. It is never stored and never logged.
4. A session token is set in an `HttpOnly` cookie; only its SHA-256 digest is
   stored.

A new account lands as `pending` unless it is the designated administrator or
`AUTO_APPROVE_MEMBERS` is on. A blocked account stays blocked whatever the
configuration says.

`plex.tv` has to be registered in Janus by the operator. Until then the sign-in
route is refused by the gateway, which is the expected behaviour, and
`DEV_LOGIN` covers local work.

## Security

- No third-party API secret in the repository, and none in the browser.
- Every input validated with Zod at the route boundary.
- Rate limiting on writes and on search, keyed by account.
- Errors return a stable code and a `messageKey`; internal detail stays in logs.
- Storage paths come from configuration only. No endpoint takes a path, and
  nothing on the machine is ever executed.
- The container runs unprivileged, read-only, with capabilities dropped.
- `noindex` in the metadata, in `robots.txt`, in a response header from Next and
  in a Traefik header: a private hub does not belong in an index.

## Interface

Server components by default; client components only where there is interaction
(search, vote, sign-in, admin writes). The language is detected from
`Accept-Language` and passed down through a provider, with no switch in the
header. Appearance follows the operating system, with an override in the account
menu.

Wording lives in `src/lib/i18n/dictionaries.ts`, where `fr` is typed against
`en`, so a missing translation is a compile error rather than a blank label.
