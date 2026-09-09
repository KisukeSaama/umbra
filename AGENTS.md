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
   API key ever enters this repository, and none of what Janus already does
   (response cache, retries, backoff, circuit breaking, quotas, OAuth tokens)
   gets reimplemented here.
2. **No free text from members.** No comments, no chat, no reviews, no captions.
   Members search, request, vote and read. That constraint is the product, not a
   missing feature: it is what removes moderation entirely.
3. **Umbra runs on the same machine as the media server.** Never build uptime
   indicators, "server online" badges or availability monitoring. If Umbra
   answers, the server is up.
4. **Umbra handles no money.** The funding goal is a number the administrator
   edits by hand, with a history. No payment provider, no donor identity, and no
   wording that suggests contributing buys access.
5. **Collect the minimum.** A Plex account id and a display name. No e-mail, no
   Plex token, no per-person watch history. Public statistics are aggregates.
6. **Code and documentation in English.** The interface is bilingual and
   detected from `Accept-Language`; every user-visible string lives in
   `src/lib/i18n/dictionaries.ts`.
7. **No em dashes, no emoji**, anywhere: code, comments, documentation, UI copy.

## Shape of the code

```
src/app/(site)      community pages, gated on an approved account
src/app/admin       administration, gated on the admin role
src/app/api         REST routes: mutations, search, sign-in, scheduled sync
src/lib/domain      the business rules; pages and routes stay thin
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

## Remotes: GitLab and GitHub stay in sync

The repository lives in two places and both must always carry the same refs.

- `origin` (fetch) is GitLab, `https://gitlab.kisukesaama.com/devops/apps/umbra.git`.
  It is the deployment remote: CI/CD and the server pull from it.
- `gh` is GitHub, `git@github.com:KisukeSaama/umbra.git`. It is the source
  mirror, used for code hosting, issues and review.

`origin` is configured with two push URLs, so a single `git push` sends the same
refs to GitLab and to GitHub. Never push to only one of them: they must stay
aligned commit for commit.

On a fresh clone, restore that configuration once:

```bash
git remote add gh git@github.com:KisukeSaama/umbra.git
git remote set-url --add --push origin https://gitlab.kisukesaama.com/devops/apps/umbra.git
git remote set-url --add --push origin git@github.com:KisukeSaama/umbra.git
```

Verify with `git remote -v`: `origin` must list two `(push)` lines. If GitHub
rejects the push while GitLab accepted it, the two sides have drifted; fix it
with `git push gh <branch>` before doing anything else.

## Before you finish

```bash
npm run lint
npm run typecheck
npm test
```
