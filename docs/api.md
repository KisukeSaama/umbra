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
  upstream gave one.
- `member` means an approved account, `assistant` a member named to help on the
  administration side, `admin` the single administrator.
- A `POST`, `PATCH` or `DELETE` sent by a browser from another origin is refused
  with 403 before any handler runs. Requests without an `Origin` (the sync worker,
  command-line tools) are not affected.

## Sign-in

**`POST /api/auth/plex/pin`** opens a Plex pin. Public, rate limited per address.

```json
{
  "pinId": "uuid",
  "code": "AB12",
  "authorizeUrl": "https://app.plex.tv/auth#..."
}
```

**`POST /api/auth/plex/claim`**, body `{ "pinId": "uuid" }`. Poll until the
visitor confirms. Answers `{ "status": "waiting" | "pending" }`, or
`{ "status": "approved", "account": { "username": "...", "role": "member" } }`,
which also sets the session cookie.

**`POST /api/auth/dev-login`**, body `{ "username": "dev", "admin": true }`, or
`{ "username": "dev", "role": "assistant" }` to sign in as an assistant.
Creates an approved account with no external call. Answers 404 unless `DEV_LOGIN`
is on, and never exists in production.

**`GET /api/auth/me`**: `{ "account": { "id", "username", "role", "status" } | null }`.

**`POST /api/auth/logout`**: deletes the session, clears the cookie.

## Community

**`GET /api/search?q=`** (member). At least two characters, rate limited per
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
      "availability": "available" | "requested" | "absent"
    }
  ]
}
```

**`POST /api/requests`** (member), body `{ "kind": "movie" | "tv", "providerId": "335984" }`.
Answers `{ "requestId": "uuid", "title": "..." }`, or 409 with
`error.alreadyAvailable` or `error.alreadyRequested`.

**`POST /api/polls/{id}/vote`** (member), body `{ "optionId": "uuid" }`. Returns
the poll with its results; 409 with `error.alreadyVoted` on a second attempt or
`error.pollClosed` on a closed poll.

**`POST /api/reports`** (member), body
`{ "kind", "providerId", "seasonNumber"?, "episodeNumber"?, "reason" }`. The
reason comes from a fixed list and must apply to what was pointed at, so a film
cannot be reported as missing a season. Answers
`{ "reportId": "uuid", "title": "...", "joined": false }`, or `joined: true` when
an identical live report already existed and the member simply joined it. 409
with `error.notOnServer` for a title that is not there, 400 with
`error.reasonNotAllowed` for a reason that does not apply.

**`GET /api/library/search`** (member). Searches the local index rather than the
provider, because only what is on the server can be reported. With `?q=` it
answers `{ "results": [...] }`; with `?providerId=` it answers
`{ "seasons": [1, 2] }`; with `?providerId=&season=` it answers
`{ "episodes": [{ "episodeNumber", "title" }] }`. Never reaches the gateway.

**`GET /api/discover/picks?mood=&anime=&format=&duration=`** (member). The guided
picker. All four are closed enums, validated here and not only offered in the
interface. `anime` is `without`, `with` or `only`: a mood says what a title is
about, this says whether it is drawn and made in Japan. Answers `{ "tonight": [...], "ideas": [...] }`: what is already on the
server, and what can be asked for.

**`GET /api/notifications`** (member): `{ "items": [...], "unread": 3 }`. A
payload holds data, never a sentence: the client resolves the wording.

**`POST /api/notifications`** (member), body `{ "ids"?: ["uuid"] }`. Marks those
read, or everything unread when `ids` is absent.

**`POST /api/account/personalisation`** (member), body `{ "enabled": false }`.
Turning it off deletes the taste profile rather than hiding it.

## Administration

All of these are open to the administrator and to the assistants, except
`PATCH /api/admin/accounts/{id}`, which is the administrator's alone.

| Route                                  | Body                                                    | Effect                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/admin/requests/{id}`       | `{ status, adminNote? }`                                | Moves a request. `accepted` on a series also starts tracking it, `adminNote` is an optional word shown to the requester and cleared on `available`                                                                               |
| `PATCH /api/admin/reports/{id}`        | `{ status }`                                            | Moves a report along its state machine. `acknowledged` on a series also starts tracking it. An illegal move is a 409                          |
| `POST /api/admin/series`               | `{ providerId }`                                        | Tracks a series and pulls its calendar                                                                                                        |
| `PATCH /api/admin/series/{id}`         | `{ enabled }`                                           | Pauses or resumes tracking                                                                                                                    |
| `PATCH /api/admin/episodes/tasks/{id}` | `{ status: "done" \| "dismissed" }`                     | Closes a task by hand                                                                                                                         |
| `POST /api/admin/announcements`        | `{ title, content, category, published, link?, poll? }` | Creates a note. `link` is `{ url, label? }`, http or https only. `poll` is `{ question, options[], endsAt? }` and opens with the note         |
| `PATCH /api/admin/announcements/{id}`  | partial                                                 | Edits or publishes                                                                                                                            |
| `DELETE /api/admin/announcements/{id}` |                                                         | Deletes                                                                                                                                       |
| `PATCH /api/admin/polls/{id}`          | `{ active }`                                            | Opens or closes the question of a note. Opening closes the others                                                                             |
| `DELETE /api/admin/polls/{id}`         |                                                         | Removes the question from its note, votes included                                                                                            |
| `PATCH /api/admin/accounts/{id}`       | `{ status?, role? }`                                    | Approves, blocks, names an assistant. `role` accepts `member` and `assistant` only, and it refuses to act on yourself or on the administrator |
| `POST /api/admin/jobs/run`             |                                                         | Runs a sync cycle now                                                                                                                         |
| `POST /api/admin/storage/scan`         |                                                         | Measures the disk now: one reading and one full walk of the configured volumes. Minutes on a large library                                    |

## Operations

**`GET /api/health`**: `{ "status": "ok" }`, or 503 when the database is
unreachable. Used by the container healthcheck. Says nothing else.

**`POST /api/cron/sync`**, header `Authorization: Bearer <CRON_SECRET>`. Runs one
sync cycle and returns what each job did:

```json
{ "outcomes": [{ "job": "library-sync", "items": 1240 }] }
```

Answers 404 when `CRON_SECRET` is unset, so the route does not exist unless it has
been configured. Called by the worker container; safe to call at any time.
