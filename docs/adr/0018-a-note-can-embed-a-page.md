# 0018 - A note can embed a page

Status: accepted

## Context

A note could carry a link and a question. Some of what the administration wants
to share reads better in place than behind a click: the trailer of a title that
just arrived, a map, a form hosted elsewhere. A link sends the reader away from
the note to see the one thing the note is about.

## Decision

A note may carry one embedded page, as a third optional block of the composer
beside the link and the question: an https address, an optional title that a
screen reader announces for the frame, and a shape chosen from a closed set
(`wide`, `square`, `tall`) rather than free dimensions.

The page is loaded by the reader's browser, straight from its host. Nothing is
fetched, proxied or stored on this side, so this is not a third-party API call
and Janus has no part in it.

The Content Security Policy gains `frame-src https:`. The staff choose the
address, and an allow-list of hosts would be one more thing to edit every time
they wanted something new. What the frame can do is bounded by the frame itself:
it is sandboxed (it may run, open a window and submit its own forms, never
navigate Umbra), sends no referrer, and loads lazily.

## Consequences

- The embed shows on the feed only. The home page card stays a teaser, and a
  frame there would make the one card that loads fast the slowest.
- The embedded host sees the reader's address, as it would for a link that was
  followed. It does not learn which note it sat in.
- Nothing about ADR 0010 changes: a fundraiser is still a link, and an embed is
  not a way to put a payment form inside Umbra.
