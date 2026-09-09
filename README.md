# Umbra

Umbra is the link between a private Plex server, Kisuflix, and the people who
use it.

Kisuflix is where you watch. Umbra is where you take part: search a title, see
whether it is already there, ask for it when it is not, follow what arrives,
vote on what comes next, and see how the server is doing.

The name nods to a messenger dog: something that carries word between the
administrator and the community, quietly.

## What it does

**For the community**

- Search movies, series and anime, with three possible answers: already on the
  server, already requested, or requestable.
- Request a missing title. One request per title, ever: no vote pile-up, no
  "me too".
- See what was added recently, what airs this week, the active poll, the latest
  announcement, storage, and the current funding goal.
- One random pick for evenings without an idea.

**For the administrator**

- An inbox: new requests, episodes to add, accounts waiting for approval.
- A series tracker: broadcast calendar pulled from the metadata provider,
  compared against the server, with a task raised for every aired episode that
  is still missing, and closed by itself when it arrives.
- Announcements, polls, storage detail and history, funding goal with a manual
  history, job status.

**What it deliberately does not do**: comments, chat, reviews, profiles, uptime
monitoring, payments, or a second copy of the Plex library.

## Stack

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| Application  | Next.js 16 (App Router), React 19, TypeScript               |
| Interface    | Tailwind CSS 4, shadcn/ui (Base UI), Phosphor icons         |
| Database     | PostgreSQL 18, Drizzle ORM, SQL migrations                  |
| Integrations | TMDB and the Plex server, both through the Janus gateway    |
| Scheduling   | A worker container calling an idempotent sync endpoint      |
| Deployment   | Docker image, Traefik, GitLab CI, dev and prod environments |

One application, one image. The worker runs the same image with another command.

## Architecture in one paragraph

Server components read straight from `src/lib/domain`; mutations go through REST
routes under `src/app/api`, which is where validation, rate limiting and
authorisation live. Integrations sit behind two contracts,
`MediaMetadataProvider` and `MediaLibraryProvider`, and every call to them
leaves through Janus, which holds the credentials. A local index of the library
(`library_item`) is what lets a search answer "already available" without asking
the media server on every keystroke. Details in
[docs/architecture.md](docs/architecture.md).

## Local setup

Requirements: Node 24, Docker, and a Janus application id and key.

```bash
cp .env.example .env.local   # then fill JANUS_APPLICATION_ID and JANUS_API_KEY
docker compose up            # the whole stack on http://localhost:3000
```

Or run Next on the host, which is faster to iterate on:

```bash
npm install
docker compose up -d postgres
npm run db:migrate           # applies drizzle/*.sql
npm run dev                  # http://localhost:3000
```

Sign in with `DEV_LOGIN=true` from the sign-in page: it creates an approved
administrator without calling plex.tv. Real sign-in needs `plex.tv` registered
in Janus first, see [docs/deployment.md](docs/deployment.md).

Then, to fill the site with real data:

```bash
curl -X POST localhost:3000/api/cron/sync -H "Authorization: Bearer $CRON_SECRET"
```

## Environment

No third-party API key belongs in this repository. TMDB and Plex credentials
live in the Janus vault; Umbra only carries its own Janus key. See `JANUS.md`.

| Variable                | Required | Purpose                                            |
| ----------------------- | -------- | -------------------------------------------------- |
| `DATABASE_URL`          | yes      | PostgreSQL connection                              |
| `JANUS_URL`             | yes      | Gateway address                                    |
| `JANUS_APPLICATION_ID`  | yes      | This service, in Janus. Not a secret               |
| `JANUS_API_KEY`         | yes      | This service's key. Secret                         |
| `JANUS_LIBRARY_SLUG`    | no       | Media library slug, default `kisuflix`             |
| `JANUS_METADATA_SLUG`   | no       | Metadata slug, default `tmdb-v3`                   |
| `JANUS_PLEX_TV_SLUG`    | no       | plex.tv slug for sign-in, default `plex-tv`        |
| `ADMIN_PLEX_ACCOUNT_ID` | no       | Plex account promoted to admin on first sign-in    |
| `AUTO_APPROVE_MEMBERS`  | no       | Skip manual approval of new accounts               |
| `SESSION_TTL_DAYS`      | no       | Session lifetime, default 30                       |
| `DEV_LOGIN`             | no       | Opens the development sign-in. Never in production |
| `STORAGE_PATHS`         | no       | Published volumes, `Label:/path`, comma separated  |
| `CRON_SECRET`           | for sync | Shared by the worker and `POST /api/cron/sync`     |
| `SYNC_INTERVAL_MINUTES` | no       | Worker interval, default 30                        |

## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # unit tests (Vitest)
npm run format       # Prettier
npm run db:generate  # regenerate migrations from the schema
npm run db:migrate   # apply migrations
```

## Repository

```
src/app/(site)     community pages
src/app/admin      administration
src/app/api        REST routes
src/components     interface, including the icon module and shadcn primitives
src/lib/domain     business rules
src/lib/providers  integration contracts and implementations
src/lib/jobs       scheduled work
src/lib/db         Drizzle schema and connection
src/lib/i18n       dictionaries and language detection
drizzle/           generated SQL migrations
deploy/            compose file and environment for the server
docs/              product, architecture, API, development, deployment, ADRs
scripts/           sync worker
tests/             unit tests
```

## Documentation

- [docs/product.md](docs/product.md) - what Umbra is, and what it refuses to be
- [docs/architecture.md](docs/architecture.md) - structure, data model, jobs
- [docs/api.md](docs/api.md) - REST surface
- [docs/development.md](docs/development.md) - working on the code
- [docs/deployment.md](docs/deployment.md) - dev and prod on the homelab
- [docs/adr/](docs/adr/) - the decisions worth remembering
- `JANUS.md` - the gateway every external call goes through
- `AGENTS.md` - the rules an agent must follow in this repository

## Attribution

Metadata provided by [TMDB](https://www.themoviedb.org/). This product is not
endorsed or certified by TMDB.
