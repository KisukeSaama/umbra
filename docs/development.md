# Development

## Getting started

Node 24, Docker, and a Janus application id and key.

```bash
cp .env.example .env.local
docker compose up            # app and database, http://localhost:3000
```

`docker compose up postgres` alone, plus `npm install && npm run db:migrate &&
npm run dev`, is the faster loop when you are editing constantly. Migrations are
applied at server start either way.

Sign in through the development entry on `/sign-in` (`DEV_LOGIN=true`): it
creates an approved administrator with no external call. To see the
administration side as an assistant, post to the same route by hand with
`{ "username": "helper", "role": "assistant" }`. Then fill the site:

```bash
curl -X POST localhost:3000/api/cron/sync -H "Authorization: Bearer $CRON_SECRET"
```

Without a Janus subscription to `kisuflix` and `tmdb-v3` the sync returns an
upstream error, which is the gateway telling you the subscription is missing.

## Working on the code

- **Business rules go in `src/lib/domain`.** Pages and routes stay thin: a page
  reads, a route validates and delegates.
- **Uniqueness belongs to the database.** Add a partial unique index rather than
  a read-then-write; two concurrent requests must not both succeed.
- **Jobs must be replayable.** Upsert on a natural key, `ON CONFLICT DO NOTHING`
  where a duplicate would be noise, and compare dates against now rather than
  reacting to a moment in time.
- **New wording means a key in both dictionaries.** `fr` is typed against `en`,
  so a missing translation fails the build rather than showing a blank.
- **Icons come from `src/components/icons.tsx`.** Adding a glyph means adding an
  export there, never an import from the library in a screen.

## Changing the schema

```bash
# edit src/lib/db/schema.ts
npm run db:generate      # writes drizzle/NNNN_name.sql
npm run db:migrate       # applies it locally
```

Migrations are committed. They are applied at container start by
`src/instrumentation.ts`, so a deployment never needs a separate step.

## Tests

```bash
npm test
```

Vitest, Node environment, `tests/**/*.test.ts`. What is worth testing here is
the logic that decides something: provider parsing (including the XML to JSON
shapes the gateway can produce), rate limiting, language detection, formatting,
and the dictionary parity check.

Anything that needs a database is not unit tested; the guarantees it relies on
are database constraints, and those are exercised by running the application.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
```

The same three run in CI on `develop`, on tags and on merge requests.

## Pinned versions

Two dependencies are deliberately not on their newest release:

- **TypeScript 6**, because typescript-eslint refuses to load against the
  TypeScript 7 API.
- **ESLint 9**, because `eslint-config-next` still carries a React plugin that
  crashes on ESLint 10.

Both move up as soon as the plugins do. Everything else tracks the latest.

## Style

- Code, comments and documentation in English.
- No em dashes and no emoji, anywhere.
- Comments explain why, not what. A comment that restates the line is noise; one
  that explains a constraint, a race, or a choice is worth keeping.
- Prettier decides formatting: `npm run format`.
