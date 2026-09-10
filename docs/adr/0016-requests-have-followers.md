# 0016 - Requests have followers, and the staff see how many wait

Status: accepted

Amends `docs/adr/0008-reports-are-choices.md` and the "One request per title"
rule of `docs/product.md`.

## Context

A request belonged to the person who opened it. A second member asking for the
same title was told it was already on the list and nothing more: they could not
follow it, were never told when it arrived, and the administration had no way of
knowing that two, five or ten people wanted it. Reports already had followers,
but their number was deliberately hidden from everyone, the administration
included, on the grounds that it would be a popularity score.

In practice that number is the most useful thing the staff can know when
choosing what to fetch or fix first. Hiding it from them did not prevent a
contest between members; it only made the queue harder to work.

## Decision

A request has followers, exactly like a report. `request_follower` holds who is
waiting on each request, the person who opened it included, and existing
requests were given their author as first follower by the migration.

- Asking for a title already on the list joins the live request. The member sees
  it on their follow-up page and receives every step and every word, the same as
  whoever asked first.
- Leaving a request is leaving, not deleting. The row only goes when the last
  person waiting leaves an untouched request. When the one who opened it leaves,
  it is handed to whoever joined next.
- The staff see who waits on each request and each report. A queue row names
  the first of them and how many others, as "Alice and 3 others", and pressing
  that lists everyone in a dialog. The dashboard, which is a glance, carries the
  number alone once it is more than one. Names are the display names Umbra
  already holds, so nothing new is collected.
- Members never see that number, anywhere. There is no counter on a card, no
  ranking and no "most wanted" shelf: the product still refuses turning asking
  into a contest.

## Consequences

- One more table, holding an account id against a request id: the same shape and
  the same retention as `report_follower`, removed with the account.
- The admin queues stay one row per title (per title, place and reason for
  reports), and one move on that row answers everyone waiting.
- `requests_created` still counts requests, not joins.
