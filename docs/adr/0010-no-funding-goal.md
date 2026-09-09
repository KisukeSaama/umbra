# 0010 - There is no funding goal, only a note carrying a link

Status: accepted

Supersedes the funding goal described in earlier versions of `docs/product.md`
and rule 4 of `AGENTS.md`.

## Context

Umbra shipped a funding goal: a target amount, a current amount, a currency, a
status, a ledger of manual adjustments, an administration page to edit them and
a card on the home page to display them. No payment provider was ever involved,
which was the point: the administrator typed in what had arrived.

In practice the contributions do not happen in Umbra and never did. They happen
on a fundraiser page hosted elsewhere. What Umbra actually needed to do was tell
people that the page exists and where it is. Everything else was a ledger kept
by hand, in a second place, about money the application never touches, with the
usual consequence of a hand-kept second copy: it is wrong most of the time.

Worse, the shape of it invited the very thing the product refuses. A progress
bar filling toward a target reads as a campaign, and a campaign has donors, and
donors get thanked, and a thanked donor is a donor identity. The feature pulled
in the direction of everything rule 4 exists to prevent.

## Decision

The funding goal is removed: the tables `funding_goal` and `funding_transaction`,
the domain module, the API routes, the administration page and the home card.
The `formatAmount` helper goes with them, because Umbra now formats no amounts
at all.

An announcement may carry one outward link instead: an address and an optional
wording for the button. A fundraiser is announced the way anything else is, in
a note that says what the money is for, with a button that leads to the page
where it actually happens. The `funding` announcement category stays, renamed
to Fundraiser, so those notes remain recognisable in the feed.

## Consequences

- Umbra now handles no amount whatsoever, rather than handling amounts it
  swore not to collect. Rule 4 becomes a statement about the schema instead of a
  promise about behaviour.
- There is no progress bar to fill, no target to reach and nothing to thank
  anyone for, so the wording that turns a contribution into an entitlement has
  nowhere to appear.
- The link is a plain http or https address, validated at the boundary. Umbra
  never calls it, never renders anything from it and knows nothing about what
  happens there.
- The history of past goals is not migrated anywhere: it was a manual ledger of
  something that is not Umbra's business. The migration drops both tables.
