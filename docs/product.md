# Product

## The one sentence

Kisuflix is where you watch. Umbra is where you take part in what surrounds it.

Umbra exists so that asking for a film does not mean sending a message to the
administrator, and so that the administrator does not have to keep a mental list
of what was asked, what aired and what is missing.

## Who it is for

**Members.** People who already have access to the server. Their experience is
deliberately small: search, request, read, vote. Four things, no account
management, no profile, no settings page.

**The administrator.** One person, with a workspace built around actions rather
than metrics: what needs a decision today, and the tools to act on it.

## The rules that shape everything

### No free text

No comments, no chat, no private messages, no reviews, no captions on polls.
Members choose from what exists; they never publish.

This is not a missing feature. It removes moderation entirely, it removes an
entire class of abuse, it keeps the interface clean, and it keeps the security
surface small.

### One request per title

A title is requested once. There is no counter, no "me too", no ranking by
popularity. The administrator sees a list of titles to consider, not a
popularity contest, and a second person asking for the same film simply sees
that it is already on the list.

### Umbra never claims a broadcast is a download

The tracker knows when an episode is scheduled to air. It never says an episode
is available because its date has passed. The wording is always: scheduled,
aired, to add, on the server.

### Umbra handles no money

The funding goal is an informational widget. The administrator moves the number
by hand, and every move leaves a history entry, negative ones included. There is
no payment integration, no donor identity, and nothing on screen may suggest
that contributing grants access or privileges.

### Umbra is not a status page

Umbra and the media server run on the same machine. If Umbra answers, the server
is up. Uptime indicators, availability alerts and maintenance banners are
therefore meaningless here and must not be built.

### Umbra is not a second Plex

No full library browser, no player, no watch history. Umbra shows what is new,
what is coming, and one random pick. Anything more belongs on the server itself.

## The three states of a search result

Every result is in exactly one state, and the state decides both the wording and
whether an action exists.

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
- **accepted**: the administrator agreed. For a series, this is also what starts
  tracking it.
- **processing**: being fetched.
- **available**: on the server. Set by hand, or automatically when the library
  sync finds the title.
- **rejected**: declined. The title can be requested again later.

## The series tracker

1. A series is tracked, either from an accepted request or added by the
   administrator.
2. Its broadcast calendar is pulled from the metadata provider and stored.
3. On every sync, each episode is compared with the server library:
   - present on the server: marked available, and its task closes itself;
   - aired but absent: marked to add, and a task is raised;
   - not aired yet: scheduled.
4. The administrator is notified once per episode.

Nothing in that depends on running at a precise moment. If Umbra is down for a
week, the next run sees every date that has passed and catches up.

## Privacy

Stored: a Plex account id, a display name, a role, a status. Sessions are stored
as a digest, never as a token, and the visitor's Plex token is used once to read
their account id and then dropped.

Never stored: e-mail addresses, watch history, who searched for what, who
contributed to a funding goal.

Public statistics are aggregates over the community as a whole: titles added
this week, requests handled, episodes added. Nothing traceable to a person.

## What is deliberately postponed

The full library, complex recommendations, anything social, gamification, a
mobile application, integrated payments, several funding goals at once, detailed
server statistics.

## The question to ask before adding anything

> Does this make Umbra simpler, more useful, or more automatic?

If a feature duplicates Plex, needs moderation, adds little, complicates the
architecture, collects more personal data, or turns Umbra into a social network,
it is refused or postponed.
