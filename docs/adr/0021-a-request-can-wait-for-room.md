# 21. A request can wait for room

## Context

Storage is finite, and some weeks there is no room for a title worth having.
The administration had two answers and neither was true.

Refusing, with a word saying "no room for now", reached the member as a
refusal, and a refusal frees the title: the partial unique index carrying "one
live request per title" excludes `rejected`, so the next member to find it
asked for it again, and the queue showed the same ask as new a few days later.

Accepting and leaving it there said it was being fetched, put the title on the
home page as coming soon, and made the "in progress" stage a list of things
nobody was doing.

## Decision

A request gets a status of its own, `postponed`: worth having, no room yet.

- It is live. It is not among `CLOSED_REQUEST_STATUSES`, so the unique index
  keeps holding the title: nobody opens a second request for it, and search and
  the title page read it as already asked for. Nothing in application code
  enforces this; the index already did.
- A member finding it can still join it. Joining is not asking again: it adds a
  name to the one request, and how many are waiting is what the administration
  reads to choose what to fetch first once there is room.
- It is reached from `requested` and from `accepted`, and left by `accepted`,
  the day there is room, or by `rejected`, the day it is given up. It is never
  reopened by hand and never declared on the server. Members cannot withdraw
  from it, as from an accepted request: it is a decision, not their gesture.
- The library sync closes it like any live request if the title arrives anyway.
- Members read a fixed sentence, "it will be added once there is more room on
  Kisuflix", in the notification, on their follow-up page and on the title
  page. The administration may add a word, as on any other move.
- The administration queue gives it a stage of its own, "on hold", read oldest
  first: the first to wait is the first to fetch. It is left out of the figure
  the navigation carries and of the dashboard, which count what needs a hand
  today. The report queue has no such stage: a season asked for is never put
  off.

## Consequences

- Refusing with a word about space is no longer the way to say "later". A
  refusal now means no.
- A series put off after being taken up keeps its tracker, as a cancelled one
  does; the tracker page is where it is dropped.
- The status check on `media_request` gains a value, in migration 0025.
