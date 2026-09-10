# 0009 - One administrator, and assistants who help

Status: accepted, amended by `docs/adr/0010-no-funding-goal.md` (there is no
funding goal for an assistant to edit; the scope itself is unchanged)

## Context

Umbra is the front door of one Plex server, and a Plex server has one owner.
That is not an implementation detail of the media server: it is who answers for
the machine, the storage and the library. Umbra mirrored it with a single
`admin` role and a designated Plex account id.

One person is however a poor queue. Requests, reports and missing episodes
arrive on a schedule nobody chose, and the administrator is not always the
person able to look at them. The need was help on the queues, not a second
owner.

The usual answer is a permission matrix: roles, capabilities, a screen to
compose them. For a private instance with a handful of people that is more
machinery than the problem, and every capability added is a decision to make
again on every new page.

## Decision

Two levels above a member, and nothing to compose.

- **`admin`**: exactly one, still designated by `ADMIN_PLEX_ACCOUNT_ID`. Not
  granted from a screen, and not taken away from one either.
- **`assistant`**: a member the administrator named. Same workspace, minus the
  accounts page: an assistant works the queues, and does not hand out access.

Uniqueness of the administrator is enforced by the database, like every other
uniqueness rule here: `account_single_admin_idx`, a unique index over the role
column restricted to the administrator row. If the configuration later names
someone else, the previous administrator steps down to assistant on the next
sign-in rather than every sign-in failing.

Two guards carry the distinction. `requireStaff` opens the administration side
to both roles, and `requireAdmin` keeps the accounts page and its route for the
administrator alone. Hiding the accounts entry from the navigation is a
courtesy; the page and the route check for themselves.

## Consequences

Naming an assistant is one click, and taking it back is one click. The scope of
an assistant is a sentence anyone can hold in their head, rather than a matrix
to read: everything except who gets in.

The funding goal, the jobs and the storage stay open to an assistant. The goal
is a number with a history and no money moves through Umbra, so an assistant
editing it is a correction, not a transaction.

There is no audit trail of who decided what. It would be the first per-person
history in a project that keeps none, and among people the administrator chose
by hand it would answer a question nobody is asking.
