# 0011 - A poll is an announcement that expects an answer

Status: accepted

## Context

Announcements and polls were two objects with two administration pages, two
composers and two lists, and on the member side they had already been merged
into one feed because reading them separately made no sense: both are the
administration saying something to the community. The feed merged them; the
model had not.

That gap cost something at both ends. The administrator wrote a poll in one
place and the note explaining it in another, then hoped the two were published
close enough together to read as one act. A member saw a bare question float
into the feed with no context, followed at some distance by a note about it. And
the bell rang twice for what was one thing.

## Decision

A poll hangs off an announcement. `poll.announcement_id` is not null, unique,
and cascades: there is no way to create a question without the note that carries
it, and deleting the note takes the question with it.

The composer follows: one form, with the question and its options as an
optional block on the note. Publishing the note opens the question, and that
single publication is what rings the bell, once.

Existing polls were given the note they should always have had, in the
migration: the question became the title, and the note was published if the poll
was running.

## Consequences

- The member feed renders one kind of card. A note that asks something draws its
  question inside itself, and the notes that ask come first, because they are
  the only ones waiting on the reader.
- One question at a time is still enforced the way it was, by closing the others
  when one opens. That rule is about the home page having one decision on it,
  not about the storage.
- `poll_open` remains a notification kind for the rows that carry it and for the
  case that still deserves one: reopening a question on a note that was already
  published. Publishing a note that carries a question does not use it.
- Nothing changes for the vote itself, which is what
  `docs/adr/0008-reports-are-choices.md` is really about: a closed set of
  options, one per person, enforced by a unique index.
