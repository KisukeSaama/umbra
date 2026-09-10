# 0008 - A report is a series of choices, never a sentence

Status: accepted

## Context

Members needed a way to say that something on the server is wrong: an episode
missing, a season that never arrived, a series behind, the wrong cut of a film,
a track absent, a file that will not play. Every product solves this with a text
box.

A text box would end the one rule that keeps Umbra small. No free text is what
removes moderation entirely, removes a class of abuse, and keeps the interface
and the security surface where they are. Trading that away for a feature would
have been trading away the reason the project is maintainable by one person.

## Decision

Reporting is three closed questions.

1. **Which title**, searched in the local library index rather than at the
   provider, because only something on the server can be reported.
2. **Where**, for a series: the whole thing, one season, or one episode. The
   list comes from what the server actually holds.
3. **What is wrong**, from a fixed list that changes with the answer to the
   second question. A film is never offered "a season is missing".

There is no field to type in anywhere in the flow. The one input on screen is a
search box, and it filters a local list.

The rules live in `src/lib/reports/reasons.ts`, a leaf module with no database
and no network, so they are unit tested like the parsers are, and the route
validates the same closed sets again at the boundary.

## Consequences

- Nothing a member submits needs reading before it is safe to display, because
  nothing a member submits is displayed: the interface renders a translation key
  from a fixed list, in the language of whoever is looking.
- A report is machine readable, so the sync can close it. An episode that
  arrives resolves its own report, and so does a season, and so does a series
  caught up. The reasons that describe a codec, a track or a playback failure
  can never close themselves, because Umbra does not index any of that and a job
  that pretended otherwise would have to walk media parts on the server.
- One live report per title, place and reason, enforced by a partial unique
  index over an expression rather than by a read. A second member reporting the
  same thing joins the existing one and is told what happens to it.
- The number of people waiting on a report routes notifications, and since
  `docs/adr/0016-requests-have-followers.md` it is also shown to the staff to
  set priorities. Members never see it: it is not a popularity score.
