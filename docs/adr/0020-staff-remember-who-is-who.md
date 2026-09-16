# 0020 - The staff remember who is who

Status: accepted, amends `docs/adr/0009-one-administrator-and-assistants.md`
(an assistant may now write one thing on the accounts page)

## Context

An account is a Plex name, and a Plex name is whatever its owner typed on
plex.tv years ago. Among a few dozen people, `darkwolf92` is somebody's cousin,
and the staff had to keep that in their heads or in a notebook next to Umbra.

## Decision

Each account carries an optional `staff_note`, a single short text of at most
200 characters, written from the accounts page.

- **Staff only.** The administrator and the assistants read it and write it.
  It is selected by the accounts page and by nothing a member is served: no
  profile, no notification, no export. The member never sees it.
- **Shared, not personal.** One note per account, the same for every staff
  member, because the question it answers ("who is this?") has one answer.
- **Open to assistants.** It grants and removes nothing, so it does not belong
  with naming help, which stays the administrator's. It has its own route,
  `PATCH /api/admin/accounts/{id}/note`, behind `requireStaff`.
- **Taken back by emptying it.** An empty box stores nothing.

## Consequences

This is personal data Umbra did not hold before, which rule 5 asks to keep to a
minimum. It is bounded: one short line, written by hand by people the member
already knows, about who they are rather than what they do. It is not a
place for a watch history, a judgement or a trail of decisions, and the length
limit and the single field are what keep it that way.

It is free text, but not from members: rule 2 is untouched, and nobody but the
staff reads it, so there is nothing to moderate.

The note goes when the account goes: it lives on the row itself.
