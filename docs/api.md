# API

The REST surface covers writes, search, sign-in and scheduled work. Page reads
do not go through it: server components call the domain layer directly.

## Conventions

- JSON in, JSON out.
- Session in an `HttpOnly` cookie, `umbra_session`.
- An error is `{ "error": "<code>", "messageKey": "<key>" }` with a matching HTTP
  status. The client resolves `messageKey` in its own language; the server never
  sends a sentence.
- Error codes: `bad_request`, `unauthorized`, `forbidden`, `not_found`,
  `conflict`, `rate_limited`, `upstream_unavailable`, `internal_error`.
- `member` means an approved account, `admin` means the administrator.
- A `POST`, `PATCH` or `DELETE` sent by a browser from another origin is
  refused with 403 before any handler runs. Requests without an `Origin`
  (the sync worker, command-line tools) are not affected.
- A `rate_limited` answer carries `Retry-After` when the upstream gave one.

## Sign-in

### `POST /api/auth/plex/pin`

Opens a Plex pin. Public, rate limited per address.

```json
{
  "pinId": "uuid",
  "code": "AB12",
  "authorizeUrl": "https://app.plex.tv/auth#..."
}
```

### `POST /api/auth/plex/claim`

Body `{ "pinId": "uuid" }`. Poll until the visitor confirms.

```json
{ "status": "waiting" }
{ "status": "pending" }
{ "status": "approved", "account": { "username": "...", "role": "member" } }
```

`approved` also sets the session cookie.

### `POST /api/auth/dev-login`

Body `{ "username": "dev", "admin": true }`. Creates an approved account without
any external call. Answers 404 unless `DEV_LOGIN` is on, and never exists in
production.

### `GET /api/auth/me`

`{ "account": { "id", "username", "role", "status" } | null }`.

### `POST /api/auth/logout`

Deletes the session, clears the cookie.

## Community

### `GET /api/search?q=` (member)

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

At least two characters. Rate limited per account.

### `POST /api/requests` (member)

Body `{ "kind": "movie" | "tv", "providerId": "335984" }`.

`{ "requestId": "uuid", "title": "..." }`, or `409` with
`error.alreadyAvailable` or `error.alreadyRequested`.

### `POST /api/polls/{id}/vote` (member)

Body `{ "optionId": "uuid" }`. Returns the poll with its results. `409` with
`error.alreadyVoted` on a second attempt, `error.pollClosed` on a closed poll.

### `GET /api/discover` (member)

`{ "item": { "title", "kind", "year", "posterUrl" } | null }`. One random title
from the server library.

## Administration

All of these require the admin role.

| Route                                       | Body                                                             | Effect                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `PATCH /api/admin/requests/{id}`            | `{ status, adminNote? }`                                         | Moves a request. `accepted` on a series also starts tracking it |
| `POST /api/admin/series`                    | `{ providerId }`                                                 | Tracks a series and pulls its calendar                          |
| `PATCH /api/admin/series/{id}`              | `{ enabled }`                                                    | Pauses or resumes tracking                                      |
| `PATCH /api/admin/episodes/tasks/{id}`      | `{ status: "done" \| "dismissed" }`                              | Closes a task by hand                                           |
| `POST /api/admin/announcements`             | `{ title, content, category, published }`                        | Creates an announcement                                         |
| `PATCH /api/admin/announcements/{id}`       | partial                                                          | Edits or publishes                                              |
| `DELETE /api/admin/announcements/{id}`      |                                                                  | Deletes                                                         |
| `POST /api/admin/polls`                     | `{ question, options[], active, endsAt? }`                       | Creates a poll. Activating closes the others                    |
| `PATCH /api/admin/polls/{id}`               | `{ active }`                                                     | Opens or closes                                                 |
| `DELETE /api/admin/polls/{id}`              |                                                                  | Deletes, votes included                                         |
| `POST /api/admin/funding`                   | `{ title, description?, targetAmountCents, currency?, status? }` | Creates a goal                                                  |
| `PATCH /api/admin/funding/{id}`             | partial                                                          | Edits, activates, completes                                     |
| `POST /api/admin/funding/{id}/transactions` | `{ deltaCents, note? }`                                          | Manual adjustment, may be negative                              |
| `PATCH /api/admin/accounts/{id}`            | `{ status?, role? }`                                             | Approves, blocks, promotes. Refuses to act on yourself          |
| `POST /api/admin/jobs/run`                  |                                                                  | Runs a sync cycle now                                           |

## Operations

### `GET /api/health`

`{ "status": "ok" }`, or `503` when the database is unreachable. Used by the
container healthcheck. Says nothing else.

### `POST /api/cron/sync`

Header `Authorization: Bearer <CRON_SECRET>`. Runs one sync cycle and returns
what each job did:

```json
{ "outcomes": [{ "job": "library-sync", "items": 1240 }] }
```

Answers 404 when `CRON_SECRET` is unset, so the route does not exist unless it
has been configured. Called by the worker container; safe to call at any time.
