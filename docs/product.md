# Product

Kisuflix is where you watch. Umbra is where you take part in what surrounds it:
asking for a film must not mean messaging the administrator, and the
administrator must not have to keep a mental list of what was asked, what aired
and what is missing.

## Who it is for

**Members**: people who already have access to the server. Their experience is
deliberately small and it is a loop: find something, ask for it or say what is
wrong with it, follow what happens, read what is going on. Every one of those is
a choice from a list rather than a form. No account management, no profile, one
switch in the account menu.

**The administrator**: one person, with a workspace built around actions rather
than metrics, showing what needs a decision today and the tools to act on it.

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

**No money.** The funding goal is informational. The administrator moves the
number by hand and every move leaves a history entry, negative ones included. No
payment integration, no donor identity, and nothing on screen may suggest that
contributing grants access or privileges.

**Not a status page.** Umbra and the media server run on the same machine, so if
Umbra answers the server is up. Uptime indicators, availability alerts and
maintenance banners are meaningless here and must not be built.

**Not a second Plex.** No library browser, no player, and never a stored list of
what anyone watched. Umbra shows what is new, what is coming, and shelves to
browse. Anything more belongs on the server itself.

## The three states of a search result

Every result is in exactly one state, which decides both the wording and whether
an action exists.

| State     | What the member sees       | Action                         |
| --------- | -------------------------- | ------------------------------ |
| Available | "Available on the server"  | none                           |
| Requested | "Request already recorded" | none                           |
| Absent    | the title, and a button    | "Request", then "Request sent" |

## The request lifecycle

```
requested -> accepted -> processing -> available
          \-> rejected
```

- **requested**: waiting for the administrator.
- **accepted**: agreed. For a series, this also starts tracking it.
- **processing**: being fetched.
- **available**: on the server. Set by hand, or automatically when the library
  sync finds the title.
- **rejected**: declined. The title can be requested again later.

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

One live report per title, place and reason. A second member reporting the same
thing joins the existing one and is told what happens to it; the number of people
waiting is never shown anywhere, the administration included, because that would
be the popularity contest this project refuses.

Three reasons settle themselves. An episode that arrives closes "an episode is
missing", a season complete closes "a season is missing", and a series caught up
closes "the series is behind". Everything else describes a codec, a track or a
playback failure, which Umbra does not index and must never try to check.

## Following what you asked for

A request used to end at "request sent". It no longer does. One page carries what
you asked for, what you reported, and what has moved since you last looked, and
the header carries a bell that says whether any of it changed.

Notifications hold data, never a sentence: a kind, a subject and a little
payload, resolved into words in the language of whoever opens them. The timelines
on the follow-up page are drawn from the timestamps on the rows themselves, so
they do not shorten when old notifications are pruned.

## Finding something to watch

Two ways in, because two different people arrive.

Shelves, for browsing: what is trending, what is airing, what is coming, what the
provider suggests from something you asked for yourself, and one shelf shaped by
an aggregated taste profile. Every card carries its state, so "is this already
here" is answered by looking rather than by searching.

The guided picker, for the evenings where even a shelf is too much. Three closed
questions, then a small selection in two halves: what is already on the server,
so the evening can start now, and what is not, so there is something to ask for.
It replaced a die that returned one random title, which was a shrug rather than
an answer.

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

Stored: a Plex account id, a display name, a role, a status. Sessions are stored
as a digest, never as a token, and the visitor's Plex token is used once to read
their account id and then dropped.

Never stored: e-mail addresses, a list of what anyone watched, who searched for
what, who contributed to a funding goal.

One aggregate is kept per account and nothing more: a handful of weighted genre
ids, rebuilt from a rolling ninety day window on every sync and therefore
replaced rather than accumulated. No title, no date, nothing a person could be
recognised by. It is switched off in the account menu, and switching it off
deletes it rather than hiding it. See `docs/adr/0007-aggregated-taste-profile.md`.

Public statistics are aggregates over the community as a whole (titles added this
week, requests handled, episodes added) and nothing traceable to a person.

## Deliberately postponed

The full library, anything social, gamification, a mobile application, browser
push notifications, integrated payments, several funding goals at once, detailed
server statistics.

## The question to ask before adding anything

> Does this make Umbra simpler, more useful, or more automatic?

If a feature duplicates Plex, needs moderation, adds little, complicates the
architecture, collects more personal data, or turns Umbra into a social network,
it is refused or postponed.
