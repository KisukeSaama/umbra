<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Umbra

Umbra is the front door of a private Plex server (Kisuflix): search a title, ask
for it, follow what arrives, take part in the decisions. Read `docs/product.md`
before changing behaviour and `docs/architecture.md` before changing structure.

## Non-negotiable rules

1. **Every third-party API call goes through Janus.** Read `JANUS.md` first. No
   API key ever enters this repository, and nothing Janus already does (response
   cache, retries, backoff, circuit breaking, quotas, OAuth tokens) gets
   reimplemented here.
2. **No free text from members.** No comments, chat, reviews or captions. Members
   search, request, report, vote and read, and every one of those is a choice
   from a list. That constraint is the product, not a missing feature: it is what
   removes moderation entirely. See `docs/adr/0008-reports-are-choices.md`.
3. **Umbra runs on the same machine as the media server.** Never build uptime
   indicators, "server online" badges or availability monitoring. If Umbra
   answers, the server is up.
4. **Umbra handles no money.** The funding goal is a number the administrator
   edits by hand, with a history. No payment provider, no donor identity, no
   wording suggesting that contributing buys access.
5. **Collect the minimum.** A Plex account id and a display name. No e-mail, no
   Plex token, and never a list of what a person watched. The one exception is
   `taste_profile`: a handful of weighted genre ids per account, rebuilt from a
   rolling window on every sync and therefore replaced rather than accumulated,
   deleted the moment a member turns personalisation off. See
   `docs/adr/0007-aggregated-taste-profile.md`. Public statistics are aggregates.
6. **Code and documentation in English.** The interface is bilingual and detected
   from `Accept-Language`; every user-visible string lives in
   `src/lib/i18n/dictionaries.ts`.
7. **No em dashes, no emoji**, anywhere: code, comments, documentation, UI copy.

## Shape of the code

```
src/app/(site)      community pages, gated on an approved account
src/app/admin       administration, gated on the admin role
src/app/api         REST routes: mutations, search, sign-in, scheduled sync
src/lib/domain      the business rules; pages and routes stay thin
src/lib/discovery   pure mapping from a closed set of answers to a query
src/lib/reports     the report rules: which reasons apply, which moves are legal
src/lib/providers   integration contracts and their implementations
src/lib/jobs        scheduled work, idempotent and observable
src/lib/db          Drizzle schema and connection
```

Reads happen in server components straight from the domain layer. Writes go
through `src/app/api`, so there is one place where validation, rate limiting and
authorisation are applied.

## Conventions

- Uniqueness is enforced by the database (partial unique indexes), never by a
  read-then-write in application code.
- Jobs must be idempotent and must not depend on running at a given time: they
  compare dates against now, so downtime is caught up rather than lost.
- Errors return a stable code and a `messageKey`; the client owns the wording.
- Icons come from `src/components/icons.tsx`, never directly from the library.
- New user-visible text means a new key in both dictionaries; `fr` is typed
  against `en`, so a missing translation fails the build.
- Visual decisions follow `docs/DESIGN.md`.

## Remotes: GitLab and GitHub stay in sync

The repository lives in two places and both must always carry the same refs.
`origin` (fetch) is GitLab, `https://gitlab.kisukesaama.com/devops/apps/umbra.git`,
the deployment remote CI/CD and the server pull from. `gh` is GitHub,
`git@github.com:KisukeSaama/umbra.git`, the source mirror used for code hosting,
issues and review.

`origin` carries two push URLs, so a single `git push` sends the same refs to
both. Never push to only one: they must stay aligned commit for commit. Verify
with `git remote -v`, where `origin` must list two `(push)` lines. If GitHub
rejects a push GitLab accepted, the two sides have drifted; fix it with
`git push gh <branch>` before doing anything else.

On a fresh clone, restore that configuration once:

```bash
git remote add gh git@github.com:KisukeSaama/umbra.git
git remote set-url --add --push origin https://gitlab.kisukesaama.com/devops/apps/umbra.git
git remote set-url --add --push origin git@github.com:KisukeSaama/umbra.git
```

## Before you finish

```bash
npm run lint
npm run typecheck
npm test
```
