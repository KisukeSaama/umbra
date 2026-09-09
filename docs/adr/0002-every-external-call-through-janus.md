# 0002 - Every external call goes through Janus

Status: accepted

## Context

Umbra needs a metadata provider and the media server. Both need credentials, and
the platform already runs Janus, a gateway that holds API secrets in a vault and
adds them on the way out.

## Decision

`src/lib/janus.ts` is the only module that talks to the outside world. It sets
the gateway headers once. No third-party credential exists in this repository or
in this application's environment.

Nothing the gateway already provides is reimplemented here: response cache,
retries, backoff, circuit breaking, quotas, OAuth tokens.

## Consequences

- A leaked deployment environment exposes one revocable Umbra key, not the
  server token and the metadata key.
- No cache layer, no retry wrapper and no circuit breaker in this codebase.
- An API that is not registered in Janus is unreachable, by design. Plex sign-in
  is refused until the operator registers `plex.tv`, and that refusal is
  documented rather than worked around.
- The media server answers in XML and the gateway converts it, so the parser
  accepts both attribute shapes the conversion can produce.
