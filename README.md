# Umbra

Umbra is the link between a private Plex server, Kisuflix, and the people who use
it. Kisuflix is where you watch. Umbra is where you take part: find something, ask
for it when it is not there, say so when what is there is wrong, follow what
happens next, vote on what comes after, and see how the server is doing. The name
nods to a messenger dog carrying word between the administrator and the
community.

## What it does

**Community.** Shelves to browse and a search palette one keystroke away, with
three possible answers on every card: already on the server, already requested, or
requestable. Request a missing title, once per title ever, with no vote pile-up.
Report a problem on something that is there, down to the episode, as three closed
choices and never a sentence. Follow your requests and reports on one page, with a
bell for what moved. A guided picker for the evenings with no idea, and shelves
shaped in part by an aggregated taste profile you can switch off. Recent
additions, what airs this week, the news feed with its polls, storage and the
funding goal.

**Administrator.** A queue of everything waiting on a decision: new requests, open
reports, episodes to add and accounts waiting for approval, each with its action
on the row. A series tracker: broadcast calendar from the metadata provider,
compared against the server, a task raised for every aired episode still missing
and closed by itself when it arrives. Announcements, polls, storage detail and
history with an "Open in Episort" link that hands a folder to the desktop sorter,
funding goal with a manual history, job status.

**Deliberately absent.** Comments, chat, reviews, profiles, uptime monitoring,
browser push, payments, a stored list of what anyone watched, a second copy of the
Plex library. See [docs/product.md](docs/product.md).

## Stack

Next.js 16 (App Router), React 19, TypeScript. Tailwind CSS 4, shadcn/ui (Base
UI), Phosphor icons. PostgreSQL 18 with Drizzle ORM and committed SQL migrations.
TMDB and the Plex server, both through the Janus gateway. Docker image behind
Traefik, deployed by GitLab CI to a dev and a prod environment. One application,
one image; the worker runs the same image with another command.

Server components read straight from `src/lib/domain`; mutations go through REST
routes under `src/app/api`, which is where validation, rate limiting and
authorisation live. Integrations sit behind two contracts,
`MediaMetadataProvider` and `MediaLibraryProvider`, and every call to them leaves
through Janus, which holds the credentials. A local index of the library
(`library_item`) is what lets a search answer "already available" without asking
the media server on every keystroke. Details in
[docs/architecture.md](docs/architecture.md).

## Quick start

Node 24, Docker, and a Janus application id and key.

```bash
cp .env.example .env.local   # then fill JANUS_APPLICATION_ID and JANUS_API_KEY
docker compose up            # whole stack on http://localhost:3000
```

Sign in with `DEV_LOGIN=true`, then fill the site with a sync. The faster loop,
the worker profile and real Plex sign-in are in
[docs/development.md](docs/development.md).

## Environment

No third-party API key belongs in this repository. TMDB and Plex credentials live
in the Janus vault; Umbra only carries its own Janus key. See `JANUS.md`.

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

`npm run dev | build | lint | typecheck | format`, `npm test` (Vitest),
`npm run db:generate` to regenerate migrations from the schema and
`npm run db:migrate` to apply them.

## Repository

`src/app` holds the community pages, the administration and the REST routes;
`src/components` the interface, the icon module and the shadcn primitives;
`src/lib` the domain rules, the provider contracts, the jobs, the Drizzle schema
and the dictionaries. Around them: `drizzle/` (generated SQL migrations),
`deploy/` (server compose and environment), `docs/`, `scripts/` (sync worker) and
`tests/`.

## Documentation

- [docs/product.md](docs/product.md) - what Umbra is, and what it refuses to be
- [docs/architecture.md](docs/architecture.md) - structure, data model, jobs
- [docs/api.md](docs/api.md) - REST surface
- [docs/development.md](docs/development.md) - working on the code
- [docs/deployment.md](docs/deployment.md) - dev and prod on the homelab
- [docs/DESIGN.md](docs/DESIGN.md) - design system and its named rules
- [docs/adr/](docs/adr/) - the decisions worth remembering
- `JANUS.md` - the gateway every external call goes through
- `AGENTS.md` - the rules an agent must follow in this repository

## Attribution

Metadata provided by [TMDB](https://www.themoviedb.org/). This product is not
endorsed or certified by TMDB.
