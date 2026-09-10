# 0015 - Suggestions seeded on titles, read live

Status: accepted

Builds on `docs/adr/0007-aggregated-taste-profile.md` and leaves its data shape
unchanged.

## Context

The personal shelf was built from the taste profile: the three heaviest genres
of a member, sent to the provider as "any of these", sorted by score. It worked
as designed and suggested poorly. A genre says almost nothing about why a title
was liked, most libraries are dominated by the same three genres so most members
got the same shelf, and sorting by score returned the same all-time classics on
every visit, many of them already seen.

A trained model was considered and set aside. The computation would be cheap on
this machine, but a server with a few dozen members does not have the data for
collaborative filtering to beat the provider's own, and training one means
storing who watched what, which is exactly what this project does not keep.

## Decision

The shelf is seeded on titles. On each render, the watch history of the last
ninety days is read from the media server, the most recent distinct titles
become seeds, and the provider is asked what goes with each one. The answers
are merged by counting: a title earns weight from every seed that proposed it,
more from recent and often watched seeds and from a high place in the provider
list. Seeds that appear in each other's answers, the films of one saga watched
in a row, are joined and vote once, so a binge cannot pass for agreement. Titles
watched in the window are left out, the same score floor as every other shelf
applies, the most voted titles are pulled back slightly so the canon does not
win by default, and no seed or saga may fill more than a few cards.

Trying this on real history exposed a parsing fault that predates it: the
history endpoint gives an episode its show only as `grandparentKey`, a path,
never as `grandparentRatingKey`. Every episode was read as standing for itself,
so series weighed nothing in the taste profile and the followed shows on the
home page came back empty. The key is now taken from the path.

Nothing is stored. The history lives for the length of one render, exactly as
the followed shows on the home page already do. The provider calls go through
the gateway, whose cache answers them for hours after the first.

When the history yields no seed, because the server did not answer or nothing
was watched, the shelf falls back to the genre profile.

The guided picker starts from the same ranking. Its four answers become a
filter read on each row, the same reading the provider applies to the query,
and what passes fills both halves first: titles on the server for tonight,
titles to ask for beside them, drawn from the head of the ranking so a second
roll is a second answer. The mood listing completes whatever the ranking could
not fill. A length question is left to the listing, since a row carries no
runtime.

## Consequences

- No new table and no change to what is kept about a person. The privacy
  promise of ADR 0007 and ADR 0013 holds as written.
- A render of the discover page costs one history read on the media server and
  up to twelve provider calls, most of them cache hits. The ranking is
  arithmetic over a few hundred rows.
- The suggestions are in the member's language, since they are asked for at
  render time rather than by a job that has no locale.
- The ranking lives in `src/lib/discovery/blend.ts`, pure and unit tested. Its
  constants are the tuning surface.
