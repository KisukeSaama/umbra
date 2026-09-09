# 0013 - Personalisation has no switch

Status: accepted

Supersedes the opt-out described in `docs/adr/0007-aggregated-taste-profile.md`.

## Context

ADR 0007 gave every member a switch in the account menu: turning personalisation
off deleted the taste profile and stopped the home page from reading the week
through what they watch.

The switch turned out to defend very little and cost a fair amount. What it
governs is a handful of weighted genre ids, replaced on every sync, with no
title, no date and nothing a person could be recognised by. The watch history it
is built from is read live from the media server, which already holds it, and is
dropped with the render. Turning the switch off did not remove data the server
keeps, it only removed the one place where that data was made useful to the
member.

It also produced a second class of member. With the switch off the home page
still rendered, but the week no longer led with the shows they are on and the
taste shelf disappeared, with nothing on screen saying why. A preference that
quietly degrades a page is worse than no preference at all.

## Decision

Personalisation is part of what Umbra is, not a setting.

The `personalisation_enabled` column is dropped, the account menu keeps only
appearance and language, and `POST /api/account/personalisation` is removed. The
profile job runs for every approved account, and the home page always reads the
week through the member.

What ADR 0007 decided about the shape of the data is unchanged and is what makes
this acceptable: an aggregate, replaced rather than accumulated, forgetting on
its own. Umbra still never stores a list of what anyone watched.

## Consequences

- One less state to reason about: there is no account for which the taste shelf
  or the followed shows are absent by configuration.
- A member who wants no profile at all stops watching, or stops using the
  server. Umbra offers no smaller lever, and it should not pretend to.
- The privacy promise now rests entirely on the shape of the data rather than on
  a switch, so any future change to `taste_profile` has to be judged on its own.
- If the media server does not answer, the profile is simply absent, exactly as
  before.
