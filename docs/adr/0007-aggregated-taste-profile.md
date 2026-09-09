# 0007 - A taste profile that is an aggregate, not a history

Status: accepted

## Context

Umbra was built to collect the minimum: a Plex account id and a display name.
That rule ruled out any form of personalisation, and it showed. The discovery
shelves could say what was popular in the world, and nothing about the people
who actually use this server.

The obvious fix is the one every media application makes: store what each person
watched and recommend from it. That is precisely the thing the project said it
would not do, and for good reasons. A watch history is the most revealing data a
media server holds, it is kept forever by default, and once it exists every
future feature is tempted to read it.

## Decision

Umbra reads the watch history and does not keep it.

On every sync cycle, for each approved account that has not opted out, the job
reads a rolling ninety day window from the media server, resolves each entry to
the genres of its title, and **replaces** that account's rows in
`taste_profile`. What is stored is a handful of weighted genre ids per account
and a kind, and nothing else: no title, no date, no count of anything a person
could be recognised by.

Members can turn it off in the account menu. Turning it off deletes the profile
in the same call rather than hiding it.

This amends rule 5 in `AGENTS.md` and the privacy section of `docs/product.md`.
The list of watched titles remains something Umbra must never store.

## Consequences

- The profile forgets on its own. Nothing accumulates, and a quiet three months
  leaves an account with no profile at all, which is the correct answer.
- The job stays idempotent: a replacement run twice gives the same rows.
- An episode counts towards its show rather than itself, so ten episodes of one
  series do not outweigh ten different films.
- Genre ids are not shared between films and shows at the provider, so the kind
  is part of the key. Reading a weight in the wrong space would return an empty
  shelf and no error at all.
- This is the only call in Umbra that is about a person rather than about the
  library, and it is why `watchHistory` returns keys and a kind and nothing
  else: there is nothing in its return value to be tempted by.
- If the media server does not answer, or the account cannot be resolved, the
  profile is simply absent and the personalised shelf disappears. Nothing else
  on the page depends on it.
