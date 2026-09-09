# 0006 - Language and appearance are detected, not chosen in the header

Status: accepted

## Context

Umbra has a French speaking community and an English speaking codebase, and it
is read at night as often as in daylight. Both are usually solved with two
buttons in the header.

## Decision

Language comes from `Accept-Language`, resolved once per request on the server
and passed down. Appearance follows the operating system by default, with an
override in the account menu.

Neither gets a control in the header.

## Consequences

- The header stays navigation and nothing else, which is what keeps it calm on a
  phone.
- The visitor already told their browser what they read; asking again would be
  noise.
- Wording lives in one dictionary module where the French side is typed against
  the English one, so a missing translation is a build error.
- A visitor whose browser is set to a third language gets English rather than a
  half-translated page.
