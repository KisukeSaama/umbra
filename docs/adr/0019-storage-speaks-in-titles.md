# 19. Storage speaks in titles

## Context

The home page showed a percentage, a bar and "1.2 TB available of 16 TB". It
said the same thing at 40% and at 96%, and a terabyte means nothing to most
members. That is the health gauge `docs/DESIGN.md` rejects: a figure always on
screen that nobody can act on.

The free space matters to a member in one place, the ask, and in one way:
whether what they ask for has somewhere to go.

## Decision

The public storage card gives the capacity and what it comes to: the free
space in bytes, then about how many films or episodes it holds. A film weighs
the median of the film folders the disk walk measured; an episode weighs the
series folders over the number of episodes the library index holds. Both are
worked out when the tree is measured and stored beside it, so the home page
never reads the map.

The server is in one of three states, from how full the disk is and the pace
it filled at over thirty days:

- **roomy**: the bar is ink, and nothing is added;
- **tight** (85%, or full within sixty days): the bar takes the lamp and the
  card says the pace in a sentence, in days or weeks;
- **full** (95%, or within fourteen days): the title page also says so, in one
  quiet line under the ask. Nothing is blocked and no banner is raised.

A title that left the server says so on its page while it is away: it was
here until a date, most likely removed to make room, and it can be asked for
again. That is a lookup over the removed requests of ADR 0017.

## Consequences

- No new table, no badge, no notification: the card, one line on the title
  page, and two columns on `storage_tree_snapshot`.
- Until the first disk walk after this change the card shows the bytes alone,
  and the pace needs a week of readings before it is printed.
- The storage card never points at a fundraiser: room on the disk is not
  something a contribution buys (ADR 0010).
