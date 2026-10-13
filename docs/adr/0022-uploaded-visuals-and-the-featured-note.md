# 0022 - A note can carry an uploaded visual, and one note can lead the home page

Status: accepted

## Context

Members did not notice the news. A note was a line in a card in the second row
of blocks on the home page, and the feed sat behind a nav entry that never said
whether anything was new on it. The note that suffered most was the one that
mattered most: the fundraiser, which members missed, and which was not clear
when they found it, since it read like any other note with a button at the end.

A note also had no picture. What the staff wanted to put in front of people, a
poster for the fundraiser, a screenshot of a change, could only be a link to an
image hosted somewhere else, and Umbra loads nothing in the browser from a third
party but the TMDB poster CDN.

## Decision

**A note may carry one visual, uploaded in the composer.** The staff drop a
file on the composer, paste one from the clipboard or pick one, see it, and can
replace or remove it. The file is sent as a bare body to
`POST /api/admin/uploads`, staff only, rate limited and refused past ten
megabytes as the bytes arrive. Umbra decodes it with sharp, which is the only
test of what it is: a name or a content type says nothing. JPEG, PNG, WebP,
GIF (first frame), HEIF and AVIF are accepted; SVG is not, since it is a
document rather than pixels. The picture is turned the way its EXIF says, fitted
inside 1600 by 1600 pixels, never enlarged, and written again as WebP with no
metadata at all: no camera, no date, no coordinates.

The stored file is named after the SHA-256 of what was written. The name is the
key the note keeps, the address it is served from never serves two pictures,
and the same picture dropped twice is one file. Files live in one directory,
`UPLOADS_PATH`, a volume of its own, since the container's root filesystem is
read-only. Umbra serves them itself at `/api/uploads/<key>.webp`, to signed-in
members only, and a member only reaches the picture of a published note. The
answer is cached by the browser for a year, `private` so no cache in front of
Umbra hands it to somebody else. Nothing is fetched from or sent to a third
party, so Janus has no part in this.

The visual has a description, written by the staff and required with it. It is
staff text like the rest of the note, so nothing a member writes is ever
published: rule 2 holds.

**Files nobody names are swept, not tracked.** A picture is written when it is
dropped, before the note exists, so some are never kept. The housekeeping step
lists the directory and deletes every file no note names once it has gone a day
untouched. The same pass covers a note deleted and a visual replaced, and it is
idempotent and compares with now, like every job here.

**The upload route is left out of the proxy.** `src/proxy.ts` runs on `/api` for
the cross-site check, and Next buffers in memory every body the proxy sees, up
to `proxyClientMaxBodySize`, one limit for the whole surface. It is set just
over the 64 kB cap of `jsonBody`. Raising it to ten megabytes for one staff
route would let any caller of any route make the server hold ten megabytes
first. The matcher therefore leaves out `/api/admin/uploads`, and that route
makes the same cross-site check itself, before anything else, with the same
function; it counts its own bytes.

**One note can be featured.** The staff can pin one published note to the top
of the home page, as the first card under the hero, large and with its visual,
until an optional end date or until they take it off. At most one is pinned,
which `announcement_single_featured_idx` enforces: pinning a note takes the pin
off the others and puts it on this one in one transaction, and two staff
pinning at the same moment get a conflict rather than two pins. A draft cannot
be pinned (`announcement_featured_published_check`), and withdrawing a note
takes its pin off. A pin past its date simply stops showing, since the query
compares with now; nothing has to run to take it down.

**The news entry says when there is something new.** A dot on "news", in the
header and in the tab bar, with words for whoever cannot see it, while a note
has gone out since the member last opened the feed. One timestamp per account,
`news_seen_at`, is all that is kept: the publication date of the newest note
the feed showed them, moved forward and never back. It is written through
`POST /api/news/seen` by the page once the browser shows it, not by the render,
because a render can be a prefetch nobody looked at.

**A fundraiser reads as one.** A note filed under the fundraiser category always
carries its link, with a default wording ("Take part in the fundraiser",
"Participer à la cagnotte"), shown as the main button wherever the note appears,
and a fixed line under it that taking part is voluntary and changes nothing
about access to Kisuflix. That line is not the staff's to write, so no wording
of the day can make contributing sound like the price of being here.

## Consequences

- Rule 4 and ADR 0010 are unchanged: there is still no amount, target, progress
  bar or donor anywhere. The visual is a picture, not a gauge, and the staff
  are the ones choosing it.
- Rule 5 grows by one timestamp per account, which records when a page was
  opened and nothing about what was read in it.
- A deleted note's picture lingers on disk until the next housekeeping pass a
  day later, and is refused to members in the meantime, since only a published
  note's visual is served to them.
- The operator has one more directory to back up and to own by uid 10001; the
  pipeline creates it next to the database.
- The image optimiser is not used for these files: it fetches without the
  reader's session, and the file is already the size Umbra chose.
