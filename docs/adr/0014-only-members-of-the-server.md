# 0014 - Only the people the server is shared with

Status: accepted

## Context

Umbra is the front door of one Plex server. Any Plex account in the world can
complete the PIN flow, so sign-in alone said nothing about whether the visitor
has the server. Approval by hand covered that, at the cost of a queue, and it
went stale: an account approved once stayed approved after the share was taken
back on plex.tv.

Two sources could answer who has the server. The media server's own `/accounts`
listing is historical, so it keeps everyone who ever connected, including people
whose share is gone. plex.tv answers exactly, but the list of shares belongs to
the owner and reading it needs the owner's token, which Umbra does not hold and
must not hold.

## Decision

Membership is read from the visitor, at the moment they sign in. The PIN flow
already puts their own Plex token in hand for one call, and
`/api/v2/resources` returns the servers that account currently reaches. If the
server's `machineIdentifier`, read from the server itself, is not in that list,
the sign-in is refused: no account is created, nothing is queued for approval,
and any session that account still had is ended on the spot.

`REQUIRE_SERVER_MEMBERSHIP` governs this and is on by default. An upstream
failure refuses the sign-in rather than letting it through.

## Consequences

- Access follows the share. Removing someone on plex.tv removes them from Umbra
  at their next sign-in, without a second list to maintain.
- Nothing new is stored and no owner credential is introduced: the token used is
  the visitor's, for one call, and dropped like the one before it.
- A person whose share is taken back would otherwise keep their cookie until it
  expired. The `membership-sweep` job closes that window: it reads the owner's
  share list and signs out whoever is no longer on it. That list needs the
  owner's token, which Janus holds under a second slug of its own
  (`JANUS_PLEX_OWNER_SLUG`, an entry sending `X-Plex-Token` as a custom header).
  plex.tv has no OAuth2 flow, so this is an application credential rather than a
  connected account. Without that slug the sweep does nothing and
  `SESSION_TTL_DAYS` bounds the window instead.
- The sweep withdraws sessions and never touches a status: sharing the server
  again is enough to let somebody back in, with the standing they had.
- If plex.tv is unreachable, nobody signs in. The switch is the way out.
