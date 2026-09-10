# Product

Kisuflix is where you watch. Umbra is where you take part in what surrounds it:
asking for a film must not mean messaging the administrator, and the
administrator must not have to keep a mental list of what was asked, what aired
and what is missing.

## Who it is for

**Members**: people who already have access to the server. Their experience is
deliberately small and it is a loop: find something, ask for it or say what is
wrong with it, follow what happens, read what is going on. Every one of those is
a choice from a list rather than a form. No account management, no profile, and
nothing in the account menu but appearance and language.

**The administrator**: one person, with a workspace built around actions rather
than metrics, showing what needs a decision today and the tools to act on it.
There is exactly one, because there is one owner of the server.

**The assistants**: members the administrator named to help on the queues. They
open the same workspace and act on the same decisions, with one exception: who
gets into the community stays the administrator's. They read the accounts page,
since knowing who is here is part of helping, and change nothing on it. Naming
an assistant and taking the role back are both one click, on that page. See
`docs/adr/0009-one-administrator-and-assistants.md`.

## The rules that shape everything

**No free text.** No comments, chat, private messages, reviews, poll captions or
report descriptions. Members choose from what exists; they never publish. This is
not a missing feature: it removes moderation entirely, removes a class of abuse,
and keeps both the interface and the security surface small.

**One request per title.** No counter, no "me too", no popularity ranking. The
administrator sees a list of titles to consider, not a contest; a second person
asking for the same film simply sees that it is already on the list.

**A broadcast is never a download.** The tracker knows when an episode is
scheduled to air and never claims availability from a passed date. The wording is
always: scheduled, aired, to add, on the server.

**No money.** Umbra holds no amount at all. A fundraiser lives on a page
elsewhere, and Umbra announces it: a note that says what it is for, with a
button leading to that page. No target, no progress bar, no payment integration,
no donor identity, and nothing on screen may suggest that contributing grants
access or privileges. See `docs/adr/0010-no-funding-goal.md`.

**Not a status page.** Umbra and the media server run on the same machine, so if
Umbra answers the server is up. Uptime indicators, availability alerts and
maintenance banners are meaningless here and must not be built.

**Not a second Plex.** No library browser, no player, and never a stored list of
what anyone watched. Umbra shows what is new, what is coming, and shelves to
browse. Anything more belongs on the server itself.

## The four states of a search result

Every result is in exactly one state, which decides both the wording and whether
an action exists.

| State     | What the member sees       | Action                         |
| --------- | -------------------------- | ------------------------------ |
| Available | "Available on the server"  | none                           |
| Partial   | "On the server, partly"    | ask for the rest               |
| Requested | "Request already recorded" | none                           |
| Absent    | the title, and a button    | "Request", then "Request sent" |

Partial exists because a series is the one thing the server can hold without
holding whole: four episodes of a season of ten. Calling that "available" in
search sent members to a page that took it back season by season, so the state
travels with the result instead. It is read from the tracker, which already
knows what has aired and has not arrived; a series nobody tracks has no calendar
to fall short of and keeps saying "available", which its own page then details
season by season. See "Asking for the rest" below.

Presence is what the rules read: a partial title cannot be requested again, and
it can be reported, exactly like a title held whole. The one thing that can take
a shortfall away without a scan is the administration answering the ask that
named it: see "Asking for the rest".

### Re-cuts

Some series sit on the server under a name the provider never gave them: "Kai",
"Yabai" and the like are re-cuts that drop the filler and renumber what is left.
The media server still matches them to the original series, so the index answers
with a hundred episodes where the provider lists a thousand, and every rule
above read that as a shortfall it could never fill.

A re-cut is not short, so it is stated instead of counted. Its page says which
cut it is, next to the year and the kind, and says in one line what such a cut
is; it reads available; and it carries no season ladder at all, because a
numbering of its own has nothing to line up against the broadcast order and the
ask for a missing episode would be an ask for something removed on purpose.

The word in the name is only a re-cut when the provider does not use it too: a
series the provider itself calls "Dragon Ball Z Kai" is called that, and keeps
its ladder. See `src/lib/domain/cuts.ts`.

It reads available, so it cannot be requested: the only thing left to do with
it is report it, exactly like any title on the server. But the list of what can
be said about it is its own. A re-cut is a fan edit: its picture, its tracks and
its numbering are the ones whoever made it chose, and nobody on this side can
put another audio track into it or fix its order, so offering "the quality is
poor" or "subtitles are missing" would build the administration a queue it can
only close. What is left is the one thing that can be acted on, there is not all
of it here yet: "an episode is missing" and "the series is behind". Both are
asks, so they close themselves when the rest arrives.

There is no "where" step either. The report is about the series, since a
numbering of its own gives nothing to point at. The rule is in
`src/lib/reports/reasons.ts` and it is enforced on the route, not only in the
dialog.

#### Re-cuts the media server matched to nothing

Some of them are filed as personal media and carry no identifier at all, not
even a TVDB one. Presence is read on the provider id, so those titles were
invisible: a server holding "Naruto Kai" still offered to request Naruto.

Their name is the only thing left, and for these it is enough, because they are
filed as the original name with the marker stuck on the end. So a pass after
each sync takes the marker off and looks the rest up, under two rules that both
refuse rather than guess: the name must match a series exactly, accents and
punctuation aside, or failing that be the beginning of exactly one series the
provider knows. That is what links "Boruto" to "Boruto: Naruto Next
Generations" without linking "Dragon Ball" to any of the four series whose name
starts that way. The year never refuses a match, since the server files a
re-cut under the year it was made rather than the year the series first aired;
it only separates two candidates that matched equally well.

What the pass finds is kept in a column of its own rather than in the provider
id the sync fills, so the next sync does not wipe it and the tracker does not
pick these series up: a re-cut has no calendar to be late on. A name it cannot
resolve stays unlinked and is looked at again a week later. See
`linkUnmatchedCuts` in `src/lib/domain/library.ts`.

## The request lifecycle

```
requested -> accepted -> processing -> available
          \-> rejected
```

- **requested**: waiting for the administrator.
- **accepted**: agreed. For a series, this also starts tracking it.
- **processing**: being fetched.
- **available**: on the server. Set by hand, or automatically when the library
  sync finds the title. By hand only once the index holds it: this is the one
  step search reads as "stop offering this", so declaring it before the sync
  agrees would close the request and hand the title back to the next member to
  ask for.
- **rejected**: declined. The title can be requested again later, as a new
  request rather than a revival of the old one: the lifecycle only moves
  forward, and a step it does not allow is refused rather than written.

Accepting a request may carry an optional word from the administration: why it
will take a while, which season is missing, what is being looked for. It reaches
the member in the notification of that step and stays on their follow-up page,
and it is erased the moment the title is on the server, by hand or by the
library sync, because it has nothing left to say then. It goes one way and
expects no answer: it is the administration speaking, not a conversation, so
the rule that members never write free text holds.

That word can be rewritten, or taken back, for as long as it is displayed, and
without moving the request: what is being looked for changes, and correcting it
should not mean pretending the request advanced. Rewriting announces nothing,
since the member was already told about the step; the new wording is simply
what their follow-up page shows from then on.

A request can be taken back by the person who opened it, from the title right
after asking and from the follow-up page afterwards, but only while it is still
`requested`. Once it is accepted the administrator has decided something, and a
member undoing that would be erasing a decision rather than their own gesture.
A cancelled request leaves no row: nothing happened to it, and the title has to
be askable again.

## Reporting a problem

A request says a title is missing. A report says a title is here and is wrong.
They are the same shape on purpose: the administrator works one queue and the
member follows one list.

A report is three closed questions, and never a sentence. Which title, chosen
from what the server actually holds. Where, for a series: the whole thing, a
season, or an episode. What is wrong, from a list that changes with the answer
before it, so a film is never offered "a season is missing". See
`docs/adr/0008-reports-are-choices.md`.

```
open -> acknowledged -> in_progress -> resolved
                     \-> rejected
                     \-> duplicate
```

Taking a report up may carry the same optional word, for everyone waiting on it,
under the same rules: it reaches them in the notification and on their follow-up
page, it can be rewritten or taken back afterwards without moving the report,
and it is erased when the report is marked fixed. A refusal keeps its word,
which is the one place the reason for it can be read.

One live report per title, place and reason. A second member reporting the same
thing joins the existing one and is told what happens to it; the number of people
waiting is never shown anywhere, the administration included, because that would
be the popularity contest this project refuses.

A report can be withdrawn while it is still live: the member leaves it and stops
hearing about it. Leaving is not deleting, because a report can be shared. The
report itself only disappears when it is still untouched and the person leaving
was the last one waiting on it, which is the case of someone who has just
reported something and changed their mind.

Three reasons settle themselves. An episode that arrives closes "an episode is
missing", a season complete closes "a season is missing", and a series caught up
closes "the series is behind". Everything else describes a codec, a track or a
playback failure, which Umbra does not index and must never try to check.

### Asking for the rest

A series that is on the server without being all there used to have no answer:
the state said "available", so the request button was gone, and the only way to
say "there are six episodes missing" was the report flow, three steps away from
the line that shows the gap. So the shortfall now carries its own press, on the
season it belongs to: with nothing of it here, "ask for this season"; with part
of it here, "ask for the missing episodes".

On the season and nowhere else. The series carried the same press for a while,
worded "ask for the update", and it said the same thing twice: the same missing
episodes could be asked for once at the top of the page and once on the season
that lacked them, as two asks the administrator then had to read as one.

It is not a fourth kind of thing. Each of them sends the report the three
questions would have produced, with the reason taken from what the panel already
knows rather than asked again: still a choice out of a list, still one queue for
the administrator, still withdrawable in the moment that follows. An ask that is
already open shows as asked instead of offering itself again, for everybody and
not only for whoever pressed first, because the report they would send is one
and the same.

An ask that has been answered stops being offered before the scan says so.
Presence is read from the index the library sync fills, so between the moment
the season lands on the server and the next pass a series still reads as short:
the search calls it partial, the season carries its gap, and the ask that has
just been answered offers itself again. So a resolved ask speaks for the index
in the meantime. The claim lasts exactly as long as it takes both passes that
decide a shortfall to run, the library sync for what is on the server and the
reconciliation for what the calendar says is late; once both have had their say,
the index takes over again whichever way it goes. An ask closed too early is
corrected by the next cycle rather than believed forever, and the queue refuses
the same ask twice in the meantime rather than trusting the page it came from.

It is not a fourth kind of thing for the administrator, and it is not a report
for the member. The row is a report, so there is one queue and one lifecycle;
the gesture was "ask for this season", so the follow-up page lists it among the
requests, with the steps a request has and the words a request uses. Listing it
under "my reports" was the same row told in the wrong voice: nobody who pressed
that button had reported anything. What stays under "my reports" is what is
actually a fault, meaning the title is on the server and something about it is
wrong.

## Following what you asked for

A request used to end at "request sent". It no longer does. One page carries what
you asked for and what you reported, with where each of them has got to, and the
header carries a bell that says whether any of it changed. The page does not
repeat the bell: notifications are read where they arrive, and a second copy of
the same feed only made the page longer.

What you asked for is one list of two kinds of row, a request for a title and an
ask for a missing season, interleaved by date. They are counted and paged
together, so a page of ten is ten lines whichever side they came from.

Notifications hold data, never a sentence: a kind, a subject and a little
payload, resolved into words in the language of whoever opens them. The timelines
on the follow-up page are drawn from the timestamps on the rows themselves, so
they do not shorten when old notifications are pruned.

## Finding something to watch

Two ways in, because two different people arrive.

Shelves, for browsing: what is trending, what is airing, what is coming, what the
provider suggests from something you asked for yourself, and one shelf shaped by
what you watched. That shelf is seeded on titles rather than genres: the last
things watched are each asked what goes with them, and what several answers
agree on comes first, minus anything already seen. The history is read for the
render and dropped (see `docs/adr/0015-suggestions-seeded-on-titles.md`). Every
card carries its state, so "is this already here" is answered by looking rather
than by searching.

The guided picker, for the evenings where even a shelf is too much. Four closed
questions, then a small selection in two halves: what is already on the server,
so the evening can start now, and what is not, so there is something to ask for.
It replaced a die that returned one random title, which was a shrug rather than
an answer. Both halves start from the same ranking as the personal shelf,
filtered by the answers, so "make me laugh" answers with comedies close to what
the member watches rather than the best rated comedies in the world, and the
mood alone fills what that ranking cannot. Anime is one of those four questions and not one of the moods: a mood
is what a title is about, anime is how it is made, so a romance can be asked for
without anime, with anime, or only in anime.

Everything Umbra puts forward on its own has to be worth the evening. A shelf and
a picker are recommendations, not results, so both halves of a selection sit
above a score floor: on the provider side it is a condition of the query, on the
server side it is read from the score stored next to each title by the pass that
fetches its poster. What is browsed and what is searched for is untouched, since
there the member named what they wanted.

Search left its page and became a key you press. Checking whether a title is
already here is the gesture members repeat most, and it should not need a
destination.

## The series tracker

1. A series is tracked, from an accepted request or added by the administrator.
2. Its broadcast calendar is pulled from the metadata provider and stored.
3. On every sync, each episode is compared with the server library: present means
   available and closes its task, aired but absent means to add and raises a
   task, otherwise scheduled.
4. Open tasks are listed in the administration, where they are handled.

Nothing there depends on running at a precise moment. If Umbra is down for a week,
the next run sees every date that has passed and catches up.

## Privacy

Stored: a Plex account id, a display name, a role, a status, and when that
account last signed in. The last one is a single timestamp, overwritten on every
sign-in rather than added to, and it exists so the administration can tell an
account somebody still uses from one nobody has opened in a year. It is not a
history: not of visits, not of pages, not of anything. Sessions are stored as a
digest, never as a token, and the visitor's Plex token is used twice on the way
in, to read their account id and to ask plex.tv whether the server is currently
shared with them, and then dropped.

Who gets in follows the server: an account the server is not shared with is
refused at sign-in, is not created, and does not join an approval queue. Taking
a share back on plex.tv is therefore all it takes to close the door here too.
See `docs/adr/0014-only-members-of-the-server.md`.

Never stored: e-mail addresses, a list of what anyone watched, who searched for
what, anything at all about who contributed to a fundraiser.

One aggregate is kept per account and nothing more: a handful of weighted genre
ids, rebuilt from a rolling ninety day window on every sync and therefore
replaced rather than accumulated. No title, no date, nothing a person could be
recognised by. It has no switch: the aggregate is what makes personalisation
possible without a history, so it is part of the product rather than a setting.
The recent history is also read live to seed the personal shelf and to lead the
week with the shows a member is on, and in both cases it is dropped with the
render. See `docs/adr/0007-aggregated-taste-profile.md`,
`docs/adr/0013-personalisation-is-not-optional.md` and
`docs/adr/0015-suggestions-seeded-on-titles.md`.

Public statistics are aggregates over the community as a whole (titles added this
week, requests handled, episodes added) and nothing traceable to a person.

## Deliberately postponed

The full library, anything social, gamification, a mobile application, browser
push notifications, integrated payments, detailed server statistics.

## The question to ask before adding anything

> Does this make Umbra simpler, more useful, or more automatic?

If a feature duplicates Plex, needs moderation, adds little, complicates the
architecture, collects more personal data, or turns Umbra into a social network,
it is refused or postponed.
