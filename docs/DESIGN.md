---
name: Umbra
description: The front door of a private Plex server. Warm paper, ink, and the ochre the messenger wears.
colors:
  paper: "oklch(0.972 0.004 85)"
  sheet: "oklch(1 0 0)"
  ink: "oklch(0.24 0.012 265)"
  muted-ink: "oklch(0.52 0.012 265)"
  quiet-sand: "oklch(0.945 0.006 85)"
  hairline: "oklch(0.9 0.006 85)"
  messenger-ochre: "oklch(0.565 0.125 57)"
  ochre-wash: "oklch(0.935 0.022 57)"
  ochre-foreground: "oklch(0.99 0.004 85)"
  moon-blue: "oklch(0.55 0.09 245)"
  alert-red: "oklch(0.58 0.2 25)"
  night: "oklch(0.16 0.008 262)"
  night-sheet: "oklch(0.205 0.009 262)"
  night-ink: "oklch(0.95 0.008 85)"
  night-muted-ink: "oklch(0.7 0.012 262)"
  night-sand: "oklch(0.26 0.009 262)"
  night-hairline: "oklch(1 0 0 / 9%)"
  messenger-ochre-night: "oklch(0.735 0.13 57)"
  ochre-wash-night: "oklch(0.285 0.022 57)"
  alert-red-night: "oklch(0.65 0.17 25)"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.18em"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "7.2px"
  md: "9.6px"
  lg: "12px"
  xl: "16.8px"
  2xl: "21.6px"
  4xl: "31.2px"
  full: "9999px"
spacing:
  card-sm: "12px"
  card: "16px"
  gutter: "16px"
  gutter-lg: "32px"
  grid-gap: "24px"
  section-gap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.messenger-ochre}"
    textColor: "{colors.ochre-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "oklch(0.565 0.125 57 / 80%)"
    textColor: "{colors.ochre-foreground}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.quiet-sand}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.lg}"
    height: "36px"
  button-destructive:
    backgroundColor: "oklch(0.58 0.2 25 / 10%)"
    textColor: "{colors.alert-red}"
    rounded: "{rounded.lg}"
    height: "36px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 12px"
    height: "36px"
  card-default:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "16px"
  badge-default:
    backgroundColor: "{colors.messenger-ochre}"
    textColor: "{colors.ochre-foreground}"
    rounded: "{rounded.4xl}"
    padding: "2px 8px"
    height: "20px"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.4xl}"
    padding: "2px 8px"
    height: "20px"
  nav-pill-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  nav-pill-idle:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  hero-search:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "56px"
    width: "576px"
---

# Design System: Umbra

## 1. Overview

North star: **the messenger's desk**. Warm paper under a lamp, blue-black ink, one
ochre, the colour the messenger dog wears in the mark. You come to leave a
request, see what arrived, pick one of two options, then go watch. The interface
must be legible and stay out of the way of the posters.

Controls are compact and borrowed wholesale from the shadcn `base-nova` vocabulary
on Base UI primitives: 36px height, 40px under a finger, 12px corners, three-pixel focus ring. The
night theme is a first-class variant, not an afterthought: the server this fronts
runs in a room that is usually dark.

The system rejects the media dashboard vocabulary: popularity counters, health
gauges, gamified progress, walls of identical cards. Umbra shows what is new, what
is coming, and one decision to make. A screen filling with metrics is the screen
being wrong, not the system.

- Warm tinted neutrals by day, near-black blues at night, the same ochre in both.
- One serif line per page, one grotesk for everything readable, one mono for codes.
- Flat at rest: depth comes from hairlines and tonal planes, not shadows.
- Compact controls, identical on member and admin screens.
- Posters carry the visual weight; the chrome stays quiet.
- Motion conveys state only, and disappears under `prefers-reduced-motion`.
  One curve, `--ease-out-quart`, is the default for every transition at 180ms;
  `--ease-out-quint` is for the few things that travel (shelves, posters, the
  poll split). Nothing answers a hover unless it can be clicked.

## 2. Colors

Two tinted neutral fields (warm paper by day, cold near-black by night) crossed by
one warm accent, deliberately rare. Warm neutrals carry hue 85, cold neutrals hue
262 to 265.

| Token           | Day                     | Night                    | Use                                                                                                            |
| --------------- | ----------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Messenger Ochre | `oklch(0.565 0.125 57)` | `oklch(0.735 0.13 57)`   | primary buttons, one-pixel underline on the active nav item, focus ring tint, the "available on Kisuflix" line |
| Ochre Wash      | `oklch(0.935 0.022 57)` | `oklch(0.285 0.022 57)`  | accent surface: hover and selected backgrounds. Carries no text beyond ink                                     |
| Quiet Sand      | `oklch(0.945 0.006 85)` | `oklch(0.26 0.009 262)`  | second neutral layer: secondary buttons, muted surfaces, active admin nav, empty poster frame                  |
| Moon Blue       | `oklch(0.55 0.09 245)`  | `oklch(0.66 0.09 245)`   | second hero glow at 14 percent, second chart series                                                            |
| Warm Paper      | `oklch(0.972 0.004 85)` | -                        | the page by day. Barely warm, never white                                                                      |
| Sheet           | `oklch(1 0 0)`          | `oklch(0.205 0.009 262)` | card and popover surface. The sidebar sits at `oklch(0.185 0.009 262)` at night                                |
| Night (page)    | -                       | `oklch(0.16 0.008 262)`  | the page after dark                                                                                            |
| Ink             | `oklch(0.24 0.012 265)` | `oklch(0.95 0.008 85)`   | primary text. A blue-black, never a neutral grey                                                               |
| Muted Ink       | `oklch(0.52 0.012 265)` | `oklch(0.7 0.012 262)`   | secondary text, placeholders, inactive nav, timestamps, counts                                                 |
| Hairline        | `oklch(0.9 0.006 85)`   | `oklch(1 0 0 / 9%)`      | borders, input strokes, dividers. A white alpha at night, so it lifts with what sits under it                  |
| Alert Red       | `oklch(0.58 0.2 25)`    | `oklch(0.65 0.17 25)`    | destructive and error, always a 10 to 20 percent background with the full hue as text                          |

**Data colour.** Three further chart hues (green 155, violet 300, gold 90) join
Messenger Ochre and Moon Blue to make a five hue set, in that order, used by one
component: the storage treemap. A hue there identifies a volume and keeps
identifying it, so the colour carries meaning rather than decoration; depth
inside a volume is the same hue mixed further into the card surface, never a
second scale. Every tile is `color-mix(in oklab, <hue> 16 to 26%, var(--card))`,
so the whole map follows the theme without a second palette for the night.

These five are for data only. They must not be borrowed for interface colour,
and no other component may use them until one earns them the way the treemap
did: by needing to tell things apart, not by wanting to look colourful.

**The One Lamp Rule.** Ochre is the only lamp on the desk: primary actions, the
current selection and state indicators. Prohibited on headings, icon fills,
dividers, non-action badges and anything decorative. Two ochre areas competing on
one screen means one is wrong. The storage treemap is the one exception, and it
is an exception to the palette rather than to the rule: see Data colour below.

**The Tinted Neutral Rule.** No `#000`, no `#fff`, no untinted grey. The one
sanctioned pure value is the daylight card, `oklch(1 0 0)`, the sheet of paper.

**The Destructive Wash Rule.** Destructive intent is a 10 percent wash with red
text, never a filled red button. Nothing a member can do here is irreversible
enough to earn a solid red.

## 3. Typography

Instrument Serif (Georgia, serif) 400 for display, Manrope (system-ui) for
everything readable, JetBrains Mono (ui-monospace) for codes. The serif is set at
400 with slight negative tracking, so it reads as a printed line rather than a
marketing headline.

| Role     | Face, weight, size                                                | Where                                                                                      |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Display  | Instrument Serif 400, 2.25rem, line-height 1.1, tracking -0.015em | the page h1 only, applied in the base layer; 1.875rem on a phone, 3.75rem on the home hero |
| Headline | Manrope 600, 1.125rem to 1.25rem, tracking tight                  | section headings, optionally a link with trailing chevron and an aside on the right        |
| Title    | Manrope 600, 1rem, line-height snug                               | card titles, in small cards too                                                            |
| Body     | Manrope 400, 1rem, line-height 1.5                                | interface default, set on the card container. Prose 65 to 75ch; container caps at 90rem    |
| Small    | Manrope 400, 0.8125rem                                            | dates, years, counts, key caps and the state under a card title. Never a sentence          |
| Label    | Manrope 500, 0.8125rem, tracking 0.18em, uppercase                | eyebrows above page titles, the wordmark at tracking 0.22em                                |
| Code     | JetBrains Mono 400                                                | job names and identifiers, nothing else                                                    |

Numbers a reader compares vertically or that update in place carry `tabular-nums`:
the week strip, the stat strip, storage figures.

**The Every Age Rule.** Kisuflix is watched by teenagers and by their
grandparents, and the interface is read by both. Body copy is 16px, the small
size is 13px and is spent on dates, years, counts and key caps, never on a hint
or an empty state. Nothing user-visible goes under 13px, and no text is muted
below the muted ink itself. Every size is in rem, so the "Text size" setting in
the account menu, one class on the root at 112.5 percent, scales the whole
interface without any component knowing.

**The One Serif Line Rule.** Instrument Serif appears exactly once per page, on
the h1, enforced by the base layer. Forbidden on section headings, card titles,
buttons, labels, data and empty states.

**The Uppercase Budget Rule.** Uppercase with wide tracking is reserved for the
wordmark and for eyebrow labels above a page title. Prohibited on buttons, badges,
nav items, table headers and section headings.

## 4. Elevation

Flat at rest. A card is a one-pixel ring at 10 percent of the foreground over a
surface one step lighter than the page. Exactly one resting element carries a real
shadow: the hero search field. Floating layers the user summoned (dialogs,
dropdowns, toasts) keep the elevation their primitives ship with.

- **Card ring**: `ring-1 ring-foreground/10`, that is `0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent)`. Every card, at rest and on hover. A contour, not a shadow.
- **Hero lift**: `shadow-lg`, the home search field only. The field is drawn as the field it stands for, loupe, placeholder and key caps, full width on a phone and 36rem at most, and opens the one palette in the header: a front door is recognised by its shape, and a button that says "Search" is not one.
- **Moon glow**: `.umbra-glow`, two radial gradients (primary at 78 percent horizontal, moon blue at 12 percent, both bleeding off the top edge). Atmosphere, not elevation. Full strength (22 and 14 percent) on the home hero, on sign-in and on the not-found screen; `.umbra-dawn` drops it to 7 and 5 percent for the band the site layout hangs at the top of every other page, and the band steps aside wherever a hero already carries the full one. The point is continuity: the top of a page is never flat paper on one screen and weather on the next, so moving between them changes the brightness of the sky rather than swapping one background for another.

**The Flat-By-Default Rule.** Reaching for `shadow-md` on a card means you want a
hairline or a tonal step instead.

**The Blur Licence Rule.** `backdrop-blur` is licensed only where content scrolls
underneath: the sticky header (background at 80 percent) and the nav pill (60
percent). No glass cards, no frosted panels.

The rule is about glass, not about atmosphere. A picture that is already blurred
and dimmed, sitting behind the page as a background, is not a frosted surface and
is allowed once per page. The home hero is built from the posters that actually
arrived this week, blurred back under a wash and a fine grain until it is weather
rather than content, which is why the page feels different in a week where a lot
arrived. No card may ever do this.

## 5. Components

**Buttons.** 12px corners (`rounded-lg`), 9.6px on the extra-small and small
sizes. Heights 28, 32, 36, 40px with matching square icon variants; default 36px
with 12px horizontal padding, so every control clears a comfortable pointer
target. On a touch screen (`pointer-coarse`, read from the pointer rather than
the viewport, because a tablet is as wide as a laptop and is still touched) the
default, small and icon sizes all come up to 40px: a finger is not a cursor.

- _Primary_: ochre on ochre-foreground, hover to the same ochre at 80 percent.
- _Outline_: hairline border on the page background, hover to Quiet Sand; at night the surface is the input colour at 30 percent.
- _Secondary_: Quiet Sand, hover to a `color-mix` five percent toward the foreground, so it darkens instead of fading.
- _Ghost_: a key drawn at rest, never words floating on the page: a five percent wash of the foreground behind an inset hairline at eight percent, its glyph in Muted Ink. Hover (and an open popup) raises the wash to nine percent and the hairline to fourteen, and brings the glyph up to ink with the word; pressing sets the wash at twelve. Mixes of the foreground rather than a fixed surface, so one rule reads on paper and at night. The default for anything that is not the main action. A step that leads nowhere (the spent side of the pagination) drops the key entirely.
- _Segmented choice_: a set of filters (the stage and order of an administration queue) sits in one track carrying that same wash and hairline; the options inside are bare, and the chosen one is lifted out as a sheet with a hairline and the smallest shadow.
- _Destructive_: red at 10 percent with red text.
- _States_: `transition-all`; focus adds a three-pixel ring at 50 percent of the ring colour plus a solid ring-coloured border; active nudges down one pixel except where it opens a popup; disabled drops to 50 percent opacity and kills pointer events; `aria-invalid` swaps border and ring to destructive, since validation is a state on the control and never a separate red block.

**Chips.** Pill shaped (31.2px radius on a 20px height), 13px text at weight 500,
a one-pixel transparent border variants fill in. The default variant is ochre and
is reserved for something genuinely primary; `secondary` and `outline` carry the
ordinary cases, here request states and episode states.

**Page rhythm.** Every page opens the same way, so moving between them does not
make the content jump: the container pads 32px above on a phone and 48px from
the small breakpoint, the h1 sits there at the display size, and the blocks
under it stand 40px apart, 48px from the small breakpoint. The workspace starts
at the same height. Inner padding stays on the 4px scale: a sheet is 24px on a
phone and 32px above, never a size of its own, and no size is written as an
arbitrary value when the scale has one.

**Cards.** `rounded-xl` (16.8px), images clipping to the top and bottom corners.
Sheet by day, Night Sheet after dark. The ring is the border: no separate border,
no shadow, at rest or on hover. Padding 16px through a `--card-spacing` custom
property that drops to 12px on the small size, so header, content and footer share
one gutter. Footers reverse into a Quiet Sand strip at 50 percent with a top
border, running to the card edge.

**Inputs.** 36px tall and 40px under a finger, like the buttons, so a toolbar
mixing the two stays on one line; selects and tabs share the height. Hairline
border, transparent background, 12px corners, 12px horizontal padding. 1rem at
every width, so iOS does not zoom on focus. Focus shifts the border to the ring colour and adds
the three-pixel ring at 50 percent: no glow, no colour change on the field.
`aria-invalid` shifts border and ring to destructive; disabled fills with the input
colour at 50 percent, drops to 50 percent opacity, blocks the cursor.

**Navigation.** Member nav: four destinations in a hairline pill with backdrop
blur, items fully rounded with 12 to 16px horizontal padding; active is foreground
text plus a one-pixel ochre underline inset to the item padding, inactive is muted
ink hovering to foreground on Quiet Sand at 60 percent, and the admin entry shows
only for the administrator and the assistants. Below the large breakpoint it
does not collapse into a burger and it does not take a second row under the
header either, which cost a quarter of a phone screen to a sticky band: it
becomes a tab bar at the foot of the screen, 56px plus the home-indicator
inset, the same four destinations sharing the width with a glyph over a 13px
word, the admin entry making five for the staff; a tablet held upright gets it
too, since the pill, the lockup and the four header actions do not share 768px
without something being clipped. Active is the filled glyph,
ink text and the same one-pixel ochre line, so the pill and the bar read as one
nav; the bar blurs, since the page scrolls under it. It publishes its height
as `--umbra-tabbar`, zero wherever it is absent, and everything that sits at
the foot of the screen (the title dock, the back-to-top button, the toasts)
adds that rather than asking whether the bar is there. Header actions carry their word at
every width: "Search" beside the loupe, "Open Plex" beside the triangle ("Plex"
on a phone), because an icon alone is a guess for anyone who has not learnt it,
and the way out to the thing people came for must not be a guess. To make room,
the lockup shows the mark alone below the small breakpoint. Admin nav: a resting sidebar from the large breakpoint, 15rem, sticky under the
site header with its own scroll, sections in three named groups (work, community,
server) with the count of what is waiting at the end of each row. Below that
breakpoint it becomes a left drawer, opened from a sticky bar that names the
current section: nine entries scrolling sideways is a menu you have to hunt
through, and a phone has no room for a permanent column. Active item Quiet Sand
at medium weight rather than an ochre fill, with the accounts entry left out for
an assistant rather than shown disabled: a door that is not theirs is not drawn.
Header: sticky, 64px, bottom border at 60 percent, backdrop blur.

**Icons.** Phosphor, exposed through `src/components/icons.tsx` at `light` weight,
`regular` only where a glyph must survive at 16px. Never imported from the library
in a screen, so weight and even library change in one place. Default 16px, never
pointer events.

**Week strip.** Three aggregate figures in one hairline-bordered row divided by
vertical hairlines, each cell a large tabular number over a 12px muted label. It
replaces the hero-metric block: no gradients, icons, trend arrows or cards. When
every figure is zero the strip removes itself rather than rendering empty state
theatre.

**Stat strip.** The same shape on the administration side, wrapping to two
columns on a phone and six on a wide screen, each cell drawing its own leading
hairlines so a last row that is not full leaves no line hanging. It counts work
waiting, so a zero is shown rather than removed: an empty queue is information.
Still no gauge, no trend arrow and no card per figure.

**Treemap.** One component, on the storage page. Rectangles squarified so they
come out closer to squares than to splinters, area proportional to bytes, one
level of children drawn inside each tile, a directory clickable and a file not.
On a phone the box is pinned above the list and is 30% of the screen height, so
the rows keep the other half; it is 4:3 from the small breakpoint and 2:1 from
the large one, and the layout is computed in the measured pixels of that box rather than
in a normalised square: a treemap laid out for one aspect ratio and stretched
into another is a treemap of splinters. A tile too small for a name does not get
one, but nothing is ever dropped for being small: the map draws in every folder
at any depth, its directories from the measurement, which keeps them all, and
the files of the folder being looked at from the listing beside it.

**Posters.** A 2:3 frame with a hairline border and a Quiet Sand ground, filled
before the image arrives so nothing shifts. Inside a link, hover and keyboard focus
scale it to 1.03 over 500ms inside the clip; a poster with no page to open stays
still. With no artwork, the frame holds the title in centred muted 13px text
instead of a broken-image glyph.

**Shelves.** A named run of poster cards, scrolling with a finger and with two
real buttons from the medium breakpoint up. The buttons are not decoration: the
rail hides its scrollbar, and a hidden scrollbar with no other affordance leaves
a keyboard or a trackpad-less mouse nowhere to go. They disappear at the ends
rather than sitting there disabled, and the rail fades at both edges so it reads
as continuing rather than as cut off. A shelf with nothing in it removes itself,
the way the week strip does. Shelves arrive one after another, opacity and
transform only, 420ms, and never all at once.

**State on the card.** Every title card carries its own state, because the
question a member arrives with is always the same. On Kisuflix is an ochre
check on the poster and the words "On Kisuflix" under the title; partly here is
a half circle and "Partly on Kisuflix"; already asked for is a quiet pill and
"Requested"; absent is nothing at all. The mark is for the glance and the line
is for everyone else: a dot in a corner is a code, and a code is only read by
the people who already know it. That is the one sanctioned ochre on a poster,
mark and line together, and it counts against the One Lamp budget for the
screen.

## 6. Do's and Don'ts

**Do**

- Give every interactive element its full state set: default, hover, focus-visible, active, disabled, and where relevant loading and invalid.
- Use skeletons shaped like the content that is coming, never a spinner parked mid-page. They do not pulse: one light passes over every block on the page at once, every three seconds or so, and rests in between (`.umbra-shimmer`). A block that pulses says something is off; a light crossing it says something is on its way.
- Add every new user-visible string to both dictionaries in `src/lib/i18n/dictionaries.ts`. French is typed against English, so a missing translation fails the build.
- Let a section remove itself when it has nothing to show, the way the week strip does.
- Write empty states that name the next action: "no request yet, search for a title".

**Don't**

- Use `border-left` or `border-right` above one pixel as a coloured accent stripe. Use a full ring, a background tint, or nothing.
- Apply `background-clip: text` with a gradient. Emphasis comes from weight and size.
- Build the big-number-plus-gradient hero metric block, or fill a screen with identically sized icon-heading-text cards. The home grid is deliberately uneven.
- Reach for a modal before exhausting the inline alternative. The dialogs are the report flow (a decision in three steps), the search palette, the list of who is waiting on a row of the administration queues, and genuine confirmations, which are real dialogs rather than the browser prompt so they can be translated and themed. A title is not one of them: it is a page, with a back link at the top left and, once that row has scrolled away, a dock centred at the bottom (a blurred pill, as licensed for anything content scrolls under) carrying the way back, the way to Plex and the return to the top.
- Animate anything that does not convey state, or animate a layout property. Transitions run 150 to 250ms; the poster scale at 500ms is the outer limit.
- Use an em dash or an emoji anywhere: code, comments, documentation, interface copy.

The named rules above hold everywhere: One Lamp, Tinted Neutral, Destructive Wash,
One Serif Line, Uppercase Budget, Flat-By-Default, Blur Licence. The product
refusals that shape screens (no free text, no uptime indicator, no payment
affordance, no request counter in front of members, no stored watch history, no wording that turns an
aired episode into a downloaded one) are in [product.md](product.md).
