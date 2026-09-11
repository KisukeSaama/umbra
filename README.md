# Umbra

Umbra is the link between a private Plex server, Kisuflix, and the people who use
it. Kisuflix is where you watch. Umbra is where you take part: find something, ask
for it when it is not there, say so when what is there is wrong, follow what
happens next, vote on what comes after, and see how the server is doing. The name
nods to a messenger dog carrying word between the administrator and the
community.

## What it does

**Community.** Shelves to browse and a search palette one keystroke away, with
the state of every card written on it: already on the server, on the server but
not whole, already requested, or requestable. Request a missing title, once per
title ever, with no vote pile-up. Ask for the season a series is short of, from
the line that shows the gap. Report a problem on something that is there, down to
the episode, as three closed choices and never a sentence. Follow your requests
and reports on one page, with a bell for what moved. A guided picker for the
evenings with no idea, and shelves shaped in part by an aggregated taste profile,
which has no switch: it is a handful of weighted genre ids, rebuilt on every sync,
and it is what makes personalisation possible without keeping a history. Recent
additions, what airs this week, the news feed with its polls, and the storage
gauge.

**Administrator.** A queue of everything waiting on a decision: new requests, open
reports and episodes to add, each with its action
on the row. A series tracker: broadcast calendar from the metadata provider,
compared against the server, a task raised for every aired episode still missing
and closed by itself when it arrives. Announcements, each able to carry one
outward link, which is how a fundraiser is told about: Umbra handles no money and
holds no amount, so the page where it happens is somewhere else. Polls. Storage
detail and history, a map of what fills the disk and a file explorer to take room
back, with an "Open in Episort" link that hands a folder to the desktop sorter.
Job status.

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

| Variable                     | Required | Purpose                                            |
| ---------------------------- | -------- | -------------------------------------------------- |
| `DATABASE_URL`               | yes      | PostgreSQL connection                              |
| `JANUS_URL`                  | yes      | Gateway address                                    |
| `JANUS_APPLICATION_ID`       | yes      | This service, in Janus. Not a secret               |
| `JANUS_API_KEY`              | yes      | This service's key. Secret                         |
| `JANUS_LIBRARY_SLUG`         | no       | Media library slug, default `kisuflix`             |
| `JANUS_METADATA_SLUG`        | no       | Metadata slug, default `tmdb-v3`                   |
| `JANUS_ANIME_SLUG`           | no       | MyAnimeList slug, default `myanimelist-v2`         |
| `JANUS_PLEX_TV_SLUG`         | no       | plex.tv slug for sign-in, default `plex-tv`        |
| `ADMIN_PLEX_ACCOUNT_ID`      | no       | Plex account promoted to admin on first sign-in    |
| `SESSION_TTL_DAYS`           | no       | Session lifetime, default 30                       |
| `DEV_LOGIN`                  | no       | Opens the development sign-in. Never in production |
| `STORAGE_PATHS`              | no       | Published volumes, `Label:/path`, comma separated  |
| `PLEX_PRODUCT`               | no       | Product name sent to plex.tv, default `Umbra`      |
| `PLEX_CLIENT_ID`             | no       | Client id sent to plex.tv, default `umbra-hub`     |
| `APP_URL`                    | no       | Public origin, for absolute icon and preview URLs  |
| `CRON_SECRET`                | for sync | Shared by the worker and `POST /api/cron/sync`     |
| `SYNC_INTERVAL_MINUTES`      | no       | Worker interval, default 30                        |
| `SYNC_STARTUP_DELAY_SECONDS` | no       | Worker wait before its first call, default 45      |

`DEV_LOGIN` is spelled `true` or `false` and read as that word rather than for
the truthiness of a string, so `false` is genuinely off. Absent or empty falls
back to the default, which is off, and a word neither of them recognises fails the boot
rather than being guessed at: a switch that guards who gets in is not a place to
be lenient.

## Commands

`npm run dev | build | start | lint | typecheck | format | format:check`,
`npm test` and `npm run test:watch` (Vitest), `npm run db:generate` to regenerate
migrations from the schema, `npm run db:migrate` to apply them and
`npm run db:studio` to open Drizzle Studio against the database.

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
