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
| `media_request`, `request_follower`           | a request and its status, and who is waiting on it                |
| `tracked_series`                              | a series under watch, and its key on the server                   |
| `episode`                                     | the broadcast calendar, and presence on the server                |
| `episode_task`                                | an aired episode that is still missing                            |
| `report`, `report_follower`                   | a problem a member pointed at, and who is waiting on it           |
| `notification`                                | what a member has been told, as data rather than as a sentence    |
| `taste_profile`                               | a few weighted genre ids per account, replaced on every run       |
| `announcement`, `poll`, `poll_option`, `vote` | community. A poll hangs off the announcement carrying it          |
| `storage_snapshot`                            | a storage measurement, with per-volume detail                     |
| `storage_tree_snapshot`                       | what fills the disk, walked directory by directory                |
| `job_state`, `job_run`                        | resume point and run history                                      |
| `analytics_daily`                             | daily counters, with no account column                            |

Uniqueness lives in the database, never in a read-then-write:

- `media_request_active_idx`, partial unique on `media_id` where the status is not
  `rejected`: two simultaneous clicks cannot create two live requests, and the
  second member joins the live one as a `request_follower` instead.
- `vote_unique_idx` on `(poll_id, account_id)`: one vote per person per poll.
- `episode_unique_idx` on `(series_id, season_number, episode_number)`: a resync
  updates instead of duplicating.
- `poll_announcement_idx`, unique on `announcement_id`: one question per note.
  A second one would be a second note. See
  `docs/adr/0011-a-poll-is-an-announcement.md`.
- `account_single_admin_idx`, unique on `role` where the role is `admin`: there
  is one administrator, and the database is what says so. The assistants named
  beside them share the workspace but not the accounts page.
- `report_active_idx`, partial unique on
  `(media_id, coalesce(season_number, -1), coalesce(episode_number, -1), reason)`
  where the status is still live. The `coalesce` is not decoration: two NULLs
  never collide in Postgres, so without it "the whole series" would duplicate on
  every click. The query builder cannot name an expression as a conflict target,
  which is why creating a report is one hand-written statement.
- `job_run_single_running_idx`, partial unique on `job_name` where the status is
  `running`: asking whether a step is going and then starting it is two
  statements, and the worker's call can land between the administrator's. The
  second insert fails instead, which the runner reads as "someone else holds
  this step" rather than as an error.
- `notification_unique_idx` on `(account_id, dedup_key)`. The key spells the
  subject and the step it announces, so a fan-out can be replayed with
  `ON CONFLICT DO NOTHING` and a request going accepted then available says both
  things rather than only the first.

`library_item` is an index, not a cache of the media server API: it is what lets a
search answer "already available" in one query instead of asking the server per
result.

## Jobs

`runSyncCycle()` in `src/lib/jobs/index.ts` runs seven steps in dependency order,
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
5. **storage-scan**: walk those volumes directory by directory and record the
   tree the administration draws as a treemap. Slow, so it is due on a clock of
   its own (six hours) rather than on every pass, asked of `job_state` and
   therefore caught up after downtime like everything else here. It keeps every
   directory and no file, which is what makes the tree complete and still small
   enough to load: the files of the folder being drawn come from the live
   listing. The walk never follows a symbolic link and never takes a path from
   a request.
6. **taste-profile**: rebuild the profile of every approved account from a
   rolling window of the media server history, replacing the rows rather than
   adding to them. There is no account it skips: personalisation has no switch,
   see `docs/adr/0013-personalisation-is-not-optional.md`.
7. **housekeeping**: delete what nothing else deletes, bounded per run so a
   backlog drains over several passes: expired sessions and pins, old job runs,
   disk maps past a week except the latest, read notifications past a month and
   everything past six.

The sweep in library-sync is scoped to the section that just answered, and only
when it answered with something. A section whose storage is not mounted comes
back empty without failing, and a sweep over the whole table would then erase it,
taking every request and report attached to those titles with it.

A cycle and a disk walk are minutes of work, so neither button in the
administration holds a request open for one. Each checks `job_run` for a step
already on its feet, refuses with a conflict if there is one, then starts the
work and returns: the run is the record, not the response. The scheduled route
is the one that waits. It asks the same question and skips its turn when a cycle
is already going, but the cycle it does start is awaited inside the request, so
what the worker logs is what each step did. Nothing in the application bounds
that wait, since `maxDuration` is read by a platform this application is not
deployed on; what bounds it is the caller, the worker giving up on the answer
after fifteen minutes while the server carries on. A long step writes where it is
into `job_state.cursor` at most every second and a half, which is what the
administration reads to say "twelve thousand files walked" instead of showing a
spinner. A run still marked running after forty-five minutes was interrupted by
a restart, and is closed as failed the next time anyone asks, so a crash never
blocks the button for good.

Reconciliation compares dates against now rather than reacting to an event, so
nothing is missed after downtime, and `ON CONFLICT DO NOTHING` on the task means a
rerun never duplicates work. A large catch-up lands as a batch of tasks rather
than being lost. The worker holds no state: it calls the endpoint, and the
endpoint knows what is left to do.

## Notifications

A notification is data, never a sentence: a kind, the subject it is about and a
small payload the client turns into words in its own language. That is what lets
the bell, the follow-up page and a toast read the same entry the same way.

The count is rendered on the server with the page, so the header is truthful on
arrival. It is kept truthful afterwards by a stream rather than by a poll:
`/api/notifications/stream` is a server-sent event stream, opened by the bell for
the signed-in member and held for as long as the tab is. It carries the unread
count and the entries that landed, and sends a heartbeat every twenty-five
seconds so no proxy calls it idle. Server-sent events rather than a socket
because everything here travels one way, and because the deployment serves Next
itself with no custom server to hang an HTTP upgrade on. The browser owns the
reconnection, and a stream refused outright, a session that expired while the tab
stayed open, is not retried at all.

What joins the write to the stream is Postgres `LISTEN`/`NOTIFY`, in
`src/lib/realtime.ts`. `notify()` and `notifyAllAccounts()` publish the
account ids their `RETURNING` clause actually inserted, so a replayed job stays
as silent on the wire as it stays in the table, and one `LISTEN` per process
dispatches to the streams that are open. The channel carries account ids and
nothing else: a stream then reads its own rows through the same domain functions
as every other reader, so no authorisation check is duplicated and nothing can be
learned about an account that is not one's own. A fan-out to everyone is sliced,
because Postgres refuses a payload over eight thousand bytes, and publishing
never throws: a nudge that goes missing costs a stale count until the next one or
the next navigation, which is exactly where the bell was before.

## Authentication

Plex PIN sign-in, through Janus. Umbra opens a pin and stores its id, so the
confirmation step cannot be pointed at an arbitrary pin; the visitor confirms on
plex.tv; Umbra polls, receives a Plex token, reads the account id with it, and
drops the token, which is never stored and never logged; a session token is set in
an `HttpOnly` cookie and only its SHA-256 digest is stored.

Membership is the only gate, and there is no account status. A sign-in is
refused unless plex.tv confirms the server is shared with that account, and an
account that passes gets a session on the spot; the membership sweep ends the
sessions of whoever the share list no longer names. Holding a session is
therefore being a member, and the accounts page only names assistants.

Three roles, and only one of them is granted from a screen. `requireStaff` gates
the administration side, which the administrator shares with the assistants they
named; `requireAdmin` keeps the accounts page and its route for the
administrator alone. If `ADMIN_PLEX_ACCOUNT_ID` later names someone else, the
previous administrator steps down to assistant on the next sign-in, because
`account_single_admin_idx` leaves room for one. See
`docs/adr/0009-one-administrator-and-assistants.md`.

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
- Storage paths come from configuration only. No endpoint takes a path outside
  a configured volume: the file explorer takes a volume label and a list of
  names, checked one by one and against the volume's real root, never through
  a symbolic link (see `docs/adr/0012-files-are-deleted-from-the-storage-page.md`).
  Nothing on the machine is ever executed. Deletion is the administrator's
  alone, bounded per batch and rate limited.
- The container runs unprivileged, read-only, with capabilities dropped.
- `noindex` in the metadata, in `robots.txt`, in a Next response header and in a
  Traefik header: a private hub does not belong in an index.

## Interface

Server components by default; client components only where there is interaction
(search, vote, sign-in, reporting, admin writes).

A title has its own route, `/title/[kind]/[id]`, and it is a page, never a panel
over the shelf it was clicked from. It carries the banner, the summary, every
season and the decision to ask for it, which is more than a dialog holds on a
phone. The page opens with a back link, which returns through history when there
is one so the shelf comes back where it was left, and falls back to a plain link
home when the address was reached cold. A button in the bottom corner appears
after a screen of scrolling and goes back to the top.

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

## The body of an announcement

An announcement body is markdown, and only the body: the title, the button
wording and a poll question stay plain text, because they are labels rather than
prose. `src/lib/markdown.ts` parses a closed subset (headings, lists, quotes,
code, rules, bold, italic, links) into typed nodes, and `src/components/markdown.tsx`
turns those nodes into elements. No HTML string exists anywhere along that path,
so nothing that is typed into the composer can become markup, and an address that
is not `http`, `https`, `mailto` or a path inside Umbra is printed rather than
linked.

The admin composer previews with that same component, so what is checked before
publishing is what the feed will set. Where a body is shown as a teaser, on the
home card and in the admin register, `plainText()` takes the marks off: a clamped
run of text stops mid-sentence, whereas clamped blocks stop mid-box.
