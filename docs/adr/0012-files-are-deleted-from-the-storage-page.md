# 0012 - Files are deleted from the storage page

Status: accepted

## Context

The storage page showed how full the disk was, then what filled it, and
stopped there. The moment after reading the map, the one where a season
nobody watches gets removed to make room for what was requested, happened
somewhere else: a shell on the server, or the media server's own interface,
which deletes a title and its files together and asks no questions about
either.

Umbra runs on the same machine as the media server and already walks the
configured volumes. Two rules kept it from touching them: no endpoint takes a
path, and nothing on the machine is ever executed. Both were written so that
a request could not have an arbitrary path inspected. Neither was written to
keep the administrator from managing the disk they own.

## Decision

The storage page carries a file explorer. It lists one directory at a time,
live, and plays a video in place. The administrator, and only the
administrator, can tick entries and delete them in a batch, after a dialog
that weighs the selection, names every entry and says that a folder goes with
everything it contains.

The rule about paths is narrowed rather than dropped. A request never carries
an absolute path. It carries the label of a configured volume and a list of
names below it, one directory per name. Each name is refused if it holds a
separator, a null byte or is `.` or `..`; the joined path is checked against
the volume's resolved root, lexically and then through the file system; a
symbolic link is never followed, never listed and never deleted. That check
lives in `src/lib/domain/storage-files.ts` and nowhere else.

Writing means deletion, nothing else: no rename, no move, no upload, no
execution. Nothing directly under the root of a volume is deletable: that is
where the libraries sit, `Movies`, `Series`, and one click there would take
one whole. A deletion happens inside a library, never of one. Batches are
bounded and rate limited.
A deletion records a storage snapshot at once, so the gauge says what just
happened; the map waits for the next scan.

Playback is the file as it is on disk, with range requests so the player can
seek. Umbra does not transcode: the media server next door does, and doing it
twice on the same machine is how a media server stops serving media. When the
browser cannot decode a format, the player says so and points to Plex.

Assistants can browse and play. The scope of an assistant is everything except
what cannot be taken back (see ADR 0009), and a deleted file is the first
thing in Umbra that cannot be.

## Consequences

The media volume is mounted read-write in the deployed stack rather than
read-only, and the files must be writable by the unprivileged user the
container runs as (uid 10001). When they are not, the deletion fails with a
message that says the volume is read-only, and nothing else changes.

Deleting a file under a title the media server still lists leaves the server
to notice on its next scan, exactly as a deletion from a shell would. Umbra
does not tell it, because that would be a second path to the same fact.

The security section of `docs/architecture.md` now says "no endpoint takes a
path outside a configured volume" instead of "no endpoint takes a path". The
scan itself is unchanged: it still takes nothing from a request.
