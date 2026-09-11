# 17. A title can leave the server

## Context

Storage is finite. A title fetched for somebody and watched by nobody else can
be deleted to free space, from the storage page (ADR 0012) or from the media
server itself. The library sync then drops it from `library_item`, and that was
all that happened.

The request that brought the title stayed `available`. Search reads a request
that is not rejected as "already asked for", so the title was neither on the
server nor askable: asking silently joined a request that was over, and the
staff never saw the ask.

The staff also had no way to know, when the title was asked for again, that it
had been deleted once already, often for a good reason.

## Decision

A request gets a last status, `removed`. The library sync writes it on every
`available` request whose title the index no longer holds, read through the
server id and the id worked out for a re-cut, the way search reads presence.
Nobody writes it by hand, and nothing moves out of it.

`removed` frees the title the way `rejected` does: the partial unique index
carrying "one live request per title" excludes both, and so does every read of
the live request. The next ask is a new request, and the removed one keeps its
history on the follow-up page of those who waited on it.

The administration queue reads that history at display time, from the earlier
requests for the same title:

- when somebody waiting on the new request was already waiting on a removed
  one, the request is shown as **asked again** instead of **new**;
- whoever asks, the row says when the title was deleted.

Nothing is stored for either: both are a lookup over rows that already exist,
so they cannot drift from them.

Members are not notified of a deletion. Their follow-up page says the title is
no longer on Kisuflix, and search offers to ask for it again.

## Consequences

- The sweep is already scoped to a section that answered with something, so a
  server mid-restart retires nothing. A section that answers with a partial
  listing would retire the requests of the titles it left out; the same listing
  already drops those titles from search, so this adds no new failure.
- Requests set to `available` by hand before the lifecycle was enforced, on a
  title the index never held, are retired by the first sync after this change.
  They were already wrong.
- "Requests handled" in the weekly figures counts `available` rows, so a title
  deleted within the window stops counting there.
