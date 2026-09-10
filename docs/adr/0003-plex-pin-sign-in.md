# 0003 - Plex PIN sign-in, and no other identity

Status: accepted

## Context

The site is private. It needs to keep strangers out, prevent double voting, and
collect as little as possible. The people who would use Umbra already have a
Plex account, because that is how they watch.

Alternatives considered: an invitation code with a pseudonymous session, and a
single shared community password.

## Decision

Sign in with Plex, through the PIN flow. Umbra stores the Plex account id and
the display name. The visitor's Plex token is used once to read that id and then
dropped: never stored, never logged.

New accounts wait for approval unless the configuration says otherwise. The
account named by `ADMIN_PLEX_ACCOUNT_ID` becomes the administrator. (Superseded
in part by `0014-only-members-of-the-server.md`: the share on plex.tv is the
only gate, and approval is gone.)

## Consequences

- Only people who already have a Plex account get in, which matches who the
  server is for.
- One identity per person, so one vote per poll and one request per title are
  enforceable.
- No password to store, no reset flow, no e-mail.
- It depends on `plex.tv` being registered in Janus. Until then, `DEV_LOGIN`
  covers local work and the flow is inert in production.
