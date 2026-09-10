# API

The REST surface covers writes, search, sign-in and scheduled work. Page reads do
not go through it: server components call the domain layer directly.

## Conventions

- JSON in, JSON out. Session in an `HttpOnly` cookie, `umbra_session`.
- An error is `{ "error": "<code>", "messageKey": "<key>" }` with a matching HTTP
  status. The client resolves `messageKey` in its own language; the server never
  sends a sentence. Codes: `bad_request`, `unauthorized`, `forbidden`,
  `not_found`, `conflict`, `rate_limited`, `upstream_unavailable`,
  `internal_error`. A `rate_limited` answer carries `Retry-After` when the
  upstream gave one, and a body that fails validation carries `fields`, the paths
  that were refused, which helps the client without saying anything about the
  server.
- `member` means a signed-in account (only somebody the server is shared with
  ever gets one), `assistant` a member named to help on the
  administration side, `admin` the single administrator.
- Rate limits are counted per minute and keyed by account, or by the address the
  edge vouches for (`CF-Connecting-IP`, then `X-Real-IP`) where there is no
  account, unless the route says otherwise. The figure is given with each route,
  and routes on the same bucket share the count.
- A `POST`, `PATCH` or `DELETE` sent by a browser from another origin is refused
  with 403 before any handler runs. Requests without an `Origin` (the sync worker,
  command-line tools) are not affected.
- A body over 64 kB is refused as a bad request without being parsed. The longest
  field on the whole surface is four thousand characters.
- Every path that names a row expects a `uuid`. Anything else is a 404, rather
  than a query the database refuses and a fault in the logs.
- The administration shares one bucket per account, sixty a minute, with less for
  the routes that cost real work: thirty for writing a note or acting on an
  account, ten for tracking a series, five for the disk walk and for starting a
  cycle. Reading the explorer and polling a walk are a bucket of their own, a
  hundred and twenty a minute, since a page that refreshes itself is not a loop.

## Sign-in

**`POST /api/auth/plex/pin`** opens a Plex pin. Public, five a minute per address
and sixty a minute for everyone together, because an address is a hint and the
global cap is not.

```json
{
  "pinId": "uuid",
  "code": "AB12",
  "authorizeUrl": "https://app.plex.tv/auth#..."
}
```

**`POST /api/auth/plex/claim`**, body `{ "pinId": "uuid" }`. Poll until the
visitor confirms: thirty a minute per pin, which is what polling needs, and
sixty a minute per address with three hundred for everyone together, because the
pin in the body is chosen by the caller and a bucket per request is no bucket at
all. Answers
`{ "status": "waiting" }`, `{ "status": "denied" }` when the server is not
shared with that Plex account, or
`{ "status": "approved", "account": { "username": "...", "role": "member" } }`,
which also sets the session cookie.

**`POST /api/auth/dev-login`**, body `{ "username": "dev", "admin": true }`, or
`{ "username": "dev", "role": "assistant" }` to sign in as an assistant.
Creates an account with no external call. Answers 404 unless `DEV_LOGIN`
is on, and never exists in production.

**`GET /api/auth/me`**: `{ "account": { "id", "username", "role" } | null }`.
No role needed: it answers `null` for a visitor.

**`POST /api/auth/logout`**: deletes the session, clears the cookie.

## Community

**`GET /api/search?q=`** (member). At least two characters, forty a minute per
account.

```json
{
  "results": [
    {
      "providerId": "335984",
      "kind": "movie",
      "title": "Blade Runner 2049",
      "originalTitle": null,
      "overview": "...",
      "year": 2017,
      "posterUrl": "https://image.tmdb.org/t/p/w342/...",
      "availability": "available" | "partial" | "requested" | "absent",
      "alternateCut": null
    }
  ]
}
```

The four states are the ones in `docs/product.md`: `partial` is a series the
server holds without holding whole, and it cannot be requested again.
`alternateCut` is `kai` or `yabai` when what the server holds under that name is
a re-cut rather than the series itself, which reads available and carries no
season ladder.

**`POST /api/requests`** (member), body `{ "kind": "movie" | "tv", "providerId": "335984" }`.
Ten a minute. Answers `{ "requestId": "uuid", "title": "..." }`, or 409 with
`error.alreadyAvailable` or `error.alreadyRequested`.

**`DELETE /api/requests/{id}`** (member). Takes a request back: only the person
who opened it, and only while it is still `requested`. Answers
`{ "cancelled": true }`, and the row is deleted rather than marked, so the title
can be asked for again. 404 with `error.requestNotFound`, 403 for a request
somebody else opened, 409 with `error.requestUnderway` once the administration
has acted on it. Shares the requests bucket.

**`POST /api/polls/{id}/vote`** (member), body `{ "optionId": "uuid" }`. Ten a
minute. Returns the poll with its results; 409 with `error.alreadyVoted` on a
second attempt or `error.pollClosed` on a closed poll.

**`POST /api/reports`** (member), body
`{ "kind", "providerId", "seasonNumber"?, "episodeNumber"?, "reason" }`. Five a
minute. The reason comes from a fixed list and must apply to what was pointed at,
so a film cannot be reported as missing a season. Answers
`{ "reportId": "uuid", "title": "...", "joined": false }`, or `joined: true` when
an identical live report already existed and the member simply joined it. 409
with `error.notOnServer` for a title that is not there, 400 with
`error.reasonNotAllowed` for a reason that does not apply, which is also the
answer for a re-cut pointed at a season or offered a reason its own list does not
carry, and 409 with `error.askSettled` for an ask the administration has just
answered and the next scan has yet to confirm.

**`DELETE /api/reports/{id}`** (member). Leaves a report. Answers
`{ "withdrawn": true, "removed": false }`, with `removed: true` when the report
itself went too, which happens only when nothing had been done to it and nobody
else was waiting on it. 409 with `error.reportClosed` once it is no longer live,
404 when the member was not following it. Shares the reports bucket.

**`GET /api/library/search`** (member). Searches the local index rather than the
provider, because only what is on the server can be reported. With `?q=` it
answers `{ "results": [...] }`; with `?providerId=` it answers
`{ "seasons": [1, 2] }`; with `?providerId=&season=` it answers
`{ "episodes": [{ "episodeNumber", "title" }] }`. Never reaches the gateway,
which is why it can afford sixty a minute.

**`GET /api/series/episodes?providerId=&season=`** (member). One season of a
series, unfolded: `{ "episodes": [{ "episodeNumber", "title", "airDate", "onServer" }] }`.
The title page asks for it when a season is opened, so a show with forty seasons
costs one call rather than forty. Sixty a minute. An episode the server holds and
the provider does not list is still reported as on the server.

**`GET /api/discover/picks?mood=&anime=&format=&duration=`** (member). The guided
picker, twenty a minute. All four are closed enums, validated here and not only
offered in the interface. `anime` is `without`, `with` or `only`: a mood says
what a title is about, this says whether it is drawn and made in Japan. Answers
`{ "tonight": [...], "ideas": [...] }`: what is already on the server, and what
can be asked for.

**`GET /api/notifications`** (member): `{ "items": [...], "unread": 3 }`. A
payload holds data, never a sentence: the client resolves the wording. Sixty a
minute.

**`POST /api/notifications`** (member), body `{ "ids"?: ["uuid"] }`. Marks those
read, or everything unread when `ids` is absent. Shares the notifications bucket.

**`GET /api/notifications/stream`** (member). The bell, live: a server-sent event
stream held open for as long as the tab is. It sends `event: notifications` with
`{ "unread": 3, "entries": [...] }`, a comment as a heartbeat every twenty-five
seconds so no proxy calls it idle, and a `retry` of five seconds for the browser
to reconnect on. Thirty opens a minute per account, which is a page being
reloaded rather than a loop; a refused stream is not retried at all. Why events
rather than a socket is in `docs/architecture.md`.

**`POST /api/locale`**, body `{ "locale": "en" | "fr" | "auto" }`. Records the
language the visitor wants to read, or hands the choice back to the browser with
`auto`, which deletes the cookie. No account needed, since the cookie is on the
visitor's own browser and the sign-in screen benefits from it too: twenty a
minute, per account when there is one and per address otherwise.

## Administration

All of these are open to the administrator and to the assistants, except
`PATCH /api/admin/accounts/{id}` and `DELETE /api/admin/storage/files`, which are
the administrator's alone: an assistant works the queues, and does not hand out
access or take anything away for good.

| Route                                  | Body                                                    | Effect                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PATCH /api/admin/requests/{id}`       | `{ status?, adminNote? }`                               | Moves a request along its lifecycle. An illegal move is a 409, as is `available` for a title the index does not hold yet. `accepted` on a series also starts tracking it; `adminNote` is an optional word shown to the requester and cleared on `available`. A body without a status rewrites the word alone |
| `PATCH /api/admin/reports/{id}`        | `{ status?, adminNote? }`                               | Moves a report along its state machine, where an illegal move is also a 409. `acknowledged` on a series also starts tracking it. A body without a status rewrites the word alone                                                                                                                             |
| `POST /api/admin/series`               | `{ providerId }`                                        | Tracks a series and pulls its calendar                                                                                                                                                                                                                                                                       |
| `PATCH /api/admin/series/{id}`         | `{ enabled }`                                           | Pauses or resumes tracking                                                                                                                                                                                                                                                                                   |
| `PATCH /api/admin/episodes/tasks/{id}` | `{ status: "done" \| "dismissed" }`                     | Closes a task by hand                                                                                                                                                                                                                                                                                        |
| `POST /api/admin/announcements`        | `{ title, content, category, published, link?, poll? }` | Creates a note. `link` is `{ url, label? }`, http or https only. `poll` is `{ question, options[], endsAt? }` and opens with the note                                                                                                                                                                        |
| `PATCH /api/admin/announcements/{id}`  | partial                                                 | Edits or publishes                                                                                                                                                                                                                                                                                           |
| `DELETE /api/admin/announcements/{id}` |                                                         | Deletes                                                                                                                                                                                                                                                                                                      |
| `PATCH /api/admin/polls/{id}`          | `{ active }`                                            | Opens or closes the question of a note. Opening closes the others                                                                                                                                                                                                                                            |
| `DELETE /api/admin/polls/{id}`         |                                                         | Removes the question from its note, votes included                                                                                                                                                                                                                                                           |
| `PATCH /api/admin/accounts/{id}`       | `{ role }`                                              | Names or unnames an assistant. Access is not set here: it follows the share on plex.tv. `role` accepts `member` and `assistant` only, and it refuses to act on yourself or on the administrator                                                                                                                                                                |
| `POST /api/admin/jobs/run`             |                                                         | Starts a sync cycle and answers `{ started: true }` without waiting for it. 409 with `error.syncRunning` when one is already on its feet                                                                                                                                                                     |
| `POST /api/admin/storage/scan`         |                                                         | Starts a measurement and a full walk of the configured volumes, and answers `{ started: true }`. Minutes of work, so the run is the record, not the response. 409 with `error.scanRunning`                                                                                                                   |
| `GET /api/admin/storage/scan`          |                                                         | Where that walk is: `{ running, startedAt, progress }`, polled by the page while it runs                                                                                                                                                                                                                     |

### The storage explorer

A request never carries a path. It carries the label of a volume the operator
configured and the names below it, one per directory, each checked on its own and
against the volume's real root. The rules are in
`docs/adr/0012-files-are-deleted-from-the-storage-page.md`.

**`GET /api/admin/storage/files?volume=&path=&path=`** answers one directory:
`{ "volume", "path": [...], "entries": [{ "name", "kind": "directory" | "file", "playable"?, "bytes", "modifiedAt" }] }`.
A directory carries no size, because measuring one is a walk and a walk belongs
to the scan. Links and special files are not listed at all, and at the root of a
volume only the libraries are.

**`POST /api/admin/storage/files/weigh`**, body
`{ "volume", "path": [...], "names": [...] }`, answers
`{ "bytes", "files", "partial" }`. It is asked once, when the confirmation opens,
which is the moment the figure is the whole point; `partial` is true when the
count stopped at its cap and the figures are a floor.

**`DELETE /api/admin/storage/files`** (admin), the same body, answers
`{ "deleted": [...], "failed": [...] }`. A name that is already gone counts as
deleted, and a link is never followed or removed. A deletion at the root of a
volume is a 409 with `error.deleteAtRoot`: it happens inside a library, never to
one. When nothing at all could go because the volume is mounted read only, the
answer is a 409 with `error.storageReadOnly` rather than a list of failures with
no reason given. Thirty a minute, and a deletion that removed something records a
new measurement at once, so the gauge does not wait for the scheduled pass.

**`GET /api/admin/storage/files/stream?volume=&path=&name=`** serves one video
file as it is on disk, with `Range` so the player can seek, and 416 with a
`Content-Range` when the range asks for something that is not there. The one
route here that answers bytes rather than JSON. Umbra never transcodes: the media
server next door already does, and whether the browser can decode the file is the
browser's answer.

## Operations

**`GET /api/health`**: `{ "status": "ok" }`, or `{ "status": "degraded" }` with a
503 when the database is unreachable. Used by the container healthcheck. Says
nothing else.

**`POST /api/cron/sync`**, header `Authorization: Bearer <CRON_SECRET>`. Runs one
sync cycle and returns what each job did:

```json
{ "outcomes": [{ "job": "library-sync", "items": 1240 }] }
```

A step it does not run is reported rather than left out:
`{ "job": "storage-scan", "items": 0, "skipped": true }` is a step that was not
due yet, or one another cycle already holds.

Unlike the two buttons in the administration, this one waits for the cycle it
started, and answers `{ "skipped": true, "outcomes": [] }` when a cycle is
already on its feet. Answers 404 when `CRON_SECRET` is unset, so the route does
not exist unless it has been configured. Ten a minute per address and thirty for
everyone together: the worker calls it twice an hour from inside the network,
and the deployment does not publish this path through the reverse proxy at all.
Called by the worker container; safe to call at any time.
