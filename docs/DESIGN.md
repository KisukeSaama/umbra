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
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.75rem"
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
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "oklch(0.565 0.125 57 / 80%)"
    textColor: "{colors.ochre-foreground}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.quiet-sand}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-destructive:
    backgroundColor: "oklch(0.58 0.2 25 / 10%)"
    textColor: "{colors.alert-red}"
    rounded: "{rounded.lg}"
    height: "32px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
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
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px"
    height: "60px"
    width: "768px"
---

# Design System: Umbra

## 1. Overview

**Creative North Star: "The Messenger's Desk"**

Umbra is a desk, not a storefront. Warm paper under a lamp, blue-black ink, and
one ochre, the colour the messenger dog wears in the mark. You come to it to
leave a request, to see what arrived, to pick one of two options. Then you leave
and go watch. The interface is the surface between the two, and its whole job is
to be legible and to get out of the way of the posters.

That gives the system its density and its restraint. Controls are compact and
familiar, borrowed wholesale from the shadcn `base-nova` vocabulary on Base UI
primitives: a 32px control height, 12px corners, a three-pixel focus ring. There
is exactly one serif line per page, the h1, set in Instrument Serif and applied
by the base layer so no screen can decide otherwise. Everything else, headings
included, is Manrope. The mono is kept for the things that are literally codes:
job names, identifiers. Colour is used almost nowhere. The ochre marks the
primary action, the current page and one state indicator, and that is the list.

What this system rejects is the entire vocabulary of the media dashboard. No
popularity counters, no server health gauges, no gamified progress, no wall of
identical cards. Umbra shows what is new, what is coming and one decision to
make. If a screen starts filling with metrics, the screen is wrong, not the
system. The night theme is not an afterthought: the same page in near-black
blues with the ochre opened up, because the server this fronts runs in a room
that is usually dark.

**Key Characteristics:**

- Warm tinted neutrals in daylight, near-black blues at night, the same ochre in both.
- One serif line per page, one grotesk for everything readable, one mono for codes.
- Flat at rest. Depth comes from hairlines and tonal planes, not shadows.
- Compact controls, 32px tall, 12px corners, consistent across member and admin screens.
- Posters carry the visual weight. The chrome around them stays quiet.
- Motion conveys state and nothing else, and disappears entirely under `prefers-reduced-motion`.

## 2. Colors: The Messenger's Desk Palette

Two tinted neutral fields, warm paper by day and cold near-black by night,
crossed by a single warm accent. Every neutral is tinted: hue 85 for the warm
paper family, hue 262 to 265 for the ink and the night. The palette is
Restrained by doctrine, and the accent is deliberately rare.

### Primary

- **Messenger Ochre** (`oklch(0.565 0.125 57)` by day, `oklch(0.735 0.13 57)` at night): the colour the dog wears in the logo. It fills primary buttons, marks the active nav item with a one-pixel underline, tints the focus ring, and colours the "available on the server" line. It is not used for decoration, headings, dividers, or icon backgrounds beyond the single funding glyph tile.
- **Ochre Wash** (`oklch(0.935 0.022 57)` by day, `oklch(0.285 0.022 57)` at night): the accent surface. Hover and selected backgrounds where a tint is needed without pulling the eye. It never carries text beyond ink.

### Secondary

- **Quiet Sand** (`oklch(0.945 0.006 85)` by day, `oklch(0.26 0.009 262)` at night): the second neutral layer. Secondary buttons, muted surfaces, the active admin nav item, the empty poster frame. This is the workhorse behind almost every non-primary state.

### Tertiary

- **Moon Blue** (`oklch(0.55 0.09 245)` by day, `oklch(0.66 0.09 245)` at night): the second glow behind the hero, at 14 percent, and the second series in any chart. Three further chart hues exist (green 155, violet 300, gold 90) and are reserved: no chart component ships yet, so they must not be borrowed for interface colour.

### Neutral

- **Warm Paper** (`oklch(0.972 0.004 85)`): the page in daylight. Barely warm, never white.
- **Sheet** (`oklch(1 0 0)`): the card and popover surface in daylight, and the one pure value in the system. It is the sheet of paper on the desk, and it earns its purity by sitting on a tinted field.
- **Ink** (`oklch(0.24 0.012 265)`): all primary text in daylight. A blue-black, never a neutral grey.
- **Muted Ink** (`oklch(0.52 0.012 265)` by day, `oklch(0.7 0.012 262)` at night): secondary text, placeholders, inactive nav, timestamps, counts.
- **Hairline** (`oklch(0.9 0.006 85)` by day, `oklch(1 0 0 / 9%)` at night): borders, input strokes, dividers. At night it is a white alpha, so it lifts with whatever sits under it.
- **Night** (`oklch(0.16 0.008 262)`) and **Night Sheet** (`oklch(0.205 0.009 262)`): the page and the card after dark. The sidebar sits between them at `oklch(0.185 0.009 262)`.
- **Alert Red** (`oklch(0.58 0.2 25)` by day, `oklch(0.65 0.17 25)` at night): destructive actions and error states, always as a 10 to 20 percent background with the full-strength hue as the text.

### Named Rules

**The One Lamp Rule.** Messenger Ochre is the only lamp on the desk. It is
permitted on primary actions, the current selection, and state indicators.
Everywhere else it is prohibited, including headings, icon fills, dividers,
badges that are not actions, and anything decorative. If a screen has two ochre
areas competing for the eye, one is wrong.

**The Tinted Neutral Rule.** No `#000`, no `#fff`, no untinted grey anywhere in
the system. Warm neutrals carry hue 85, cold neutrals carry hue 262 to 265. The
single exception is the daylight card surface, `oklch(1 0 0)`, which is the
sheet of paper and is deliberate.

**The Destructive Wash Rule.** Destructive intent is shown as a 10 percent wash
with red text, never as a filled red button. Nothing a member can do in Umbra is
irreversible enough to earn a solid red.

## 3. Typography

**Display Font:** Instrument Serif (with Georgia, serif), weight 400, normal and italic.
**Body Font:** Manrope (with system-ui, sans-serif).
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace).

**Character:** An editorial serif for the few large lines that carry the mood, a
warm geometric grotesk for everything that has to be read, and a mono kept
strictly for codes and job names. The pairing is quiet: the serif is set at 400
with a slight negative tracking, so it reads as a printed line rather than a
marketing headline.

### Hierarchy

- **Display** (Instrument Serif 400, 2.25rem rising to 3.75rem on the home hero and 3rem on admin, line-height 1.1, tracking -0.015em): the page h1, and only the h1. Applied globally in the base layer.
- **Headline** (Manrope 600, 1.125rem rising to 1.25rem, tracking tight): section headings, the one shape used across every screen, optionally a link with a trailing chevron and an aside on the right.
- **Title** (Manrope 600, 1rem, line-height snug, tracking tight): card titles, dropping to 0.875rem in small cards.
- **Body** (Manrope 400, 0.875rem, line-height 1.5): the default text size of the entire interface, set on the card container itself. Prose paragraphs stay within 65 to 75ch; the container caps at 72rem, which the three-column grid keeps well inside.
- **Label** (Manrope 500, 0.75rem, tracking 0.18em, uppercase): eyebrows above page titles, the "for Kisuflix" line under the wordmark at 0.62rem, and the wordmark itself at tracking 0.22em. This is where the system spends its letter-spacing.
- **Code** (JetBrains Mono 400): job names and identifiers, nothing else.

Numbers that a reader compares vertically or that update in place carry
`tabular-nums`: the week strip, the funding amounts, the storage figures.

### Named Rules

**The One Serif Line Rule.** Instrument Serif appears exactly once per page, on
the h1, and the base layer enforces it. It is forbidden on section headings,
card titles, buttons, labels, data, and empty states. One voice for the mood,
one for the information.

**The Uppercase Budget Rule.** Uppercase with wide tracking is reserved for the
wordmark and for eyebrow labels above a page title. It is prohibited on buttons,
badges, nav items, table headers, and section headings.

## 4. Elevation

Umbra is flat at rest. Depth is carried by hairlines and by tonal planes, not by
shadows. A card is a one-pixel ring at 10 percent of the foreground over a
surface one step lighter than the page. The sticky header is a bottom border
plus a backdrop blur over a background at 80 percent, and the nav pill is the
same treatment at 60 percent: those two are the only sanctioned uses of blur in
the system, and they exist because content scrolls underneath them, not for
looks.

Exactly one element at rest carries a real shadow: the hero search field, which
is the one input that matters on the site and is allowed to sit above the page.
Floating layers that the user summoned, dialogs, dropdowns, and toasts, carry
the elevation their primitives ship with. Nothing else does.

### Shadow Vocabulary

- **Card ring** (`box-shadow: 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent)`, written as `ring-1 ring-foreground/10`): every card, at rest and on hover. Not a shadow, a contour.
- **Hero lift** (`shadow-lg`): the home search field only.
- **Moon glow** (`.umbra-glow`, two radial gradients: 22 percent primary at 78 percent horizontal, 14 percent moon blue at 12 percent, both bleeding off the top edge): the hero band background. It is atmosphere, not elevation, and it appears once per site.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat. A shadow states that an element
floats above the page, and in Umbra exactly one resting element does. If you are
reaching for `shadow-md` on a card, you want a hairline or a tonal step instead.

**The Blur Licence Rule.** `backdrop-blur` is licensed only where content
scrolls underneath: the sticky header and the nav pill. Glass cards, blurred
panels, and frosted overlays are prohibited.

## 5. Components

Compact and sober. A 32px control height, 12px corners, no decoration. The tool
disappears behind the task, and the member and admin surfaces share one
vocabulary so a button never means two things.

### Buttons

- **Shape:** gently curved (12px, `rounded-lg`), dropping to 9.6px on the extra-small and small sizes. Sizes run 24, 28, 32, and 36px tall, with matching square icon variants. Default is 32px with 10px horizontal padding.
- **Primary:** Messenger Ochre on ochre-foreground, hovering to the same ochre at 80 percent.
- **Outline:** a hairline border on the page background, hovering to Quiet Sand. At night the surface is the input colour at 30 percent.
- **Secondary:** Quiet Sand, hovering to a `color-mix` five percent toward the foreground rather than an opacity change, so it darkens instead of fading.
- **Ghost:** transparent, hovering to Quiet Sand. The default for anything that is not the main action on a screen.
- **Destructive:** the wash treatment, red at 10 percent with red text.
- **Hover / Focus / Active:** transitions run on `transition-all`. Focus shows a three-pixel ring at 50 percent of the ring colour plus a solid ring-coloured border. Active nudges the button down one pixel, except where it opens a popup. Disabled drops to 50 percent opacity and kills pointer events.
- **Invalid:** `aria-invalid` swaps the border and ring to destructive. Validation is a state on the control, never a separate red block.

### Chips

- **Style:** fully rounded (31.2px on a 20px height, so effectively a pill), 12px text at weight 500, a one-pixel transparent border that variants fill in.
- **State:** the default variant is ochre and must be reserved for something genuinely primary. `secondary` and `outline` carry the ordinary cases, which in Umbra means request states and episode states.

### Cards / Containers

- **Corner Style:** 16.8px (`rounded-xl`), with images clipping to the top and bottom corners automatically.
- **Background:** Sheet by day, Night Sheet after dark.
- **Shadow Strategy:** the card ring from Elevation. No shadow, at rest or on hover.
- **Border:** none. The ring is the border.
- **Internal Padding:** 16px, driven by a `--card-spacing` custom property that drops to 12px on the small size, so header, content, and footer stay on one gutter. Footers reverse into a Quiet Sand strip at 50 percent with a top border and run to the card edge.

### Inputs / Fields

- **Style:** 32px tall, hairline border, transparent background, 12px corners, 10px horizontal padding. Base size is 1rem on mobile and 0.875rem from the medium breakpoint up, so iOS does not zoom on focus.
- **Focus:** the border shifts to the ring colour and a three-pixel ring at 50 percent appears. No glow, no colour change on the field itself.
- **Error / Disabled:** `aria-invalid` shifts border and ring to destructive; disabled fills with the input colour at 50 percent, drops to 50 percent opacity, and blocks the cursor.

### Navigation

- **Member nav:** four destinations in a hairline pill with a backdrop blur, each item fully rounded with 12 to 16px of horizontal padding. The active item is foreground text plus a one-pixel ochre underline inset to the item padding; inactive items are muted ink and hover to foreground on Quiet Sand at 60 percent. The admin entry appears only for administrators.
- **Mobile:** the nav does not collapse into a burger. It moves below the wordmark on its own row, centred, because four items fit and one tap beats two.
- **Admin nav:** a horizontally scrollable row on small screens that becomes a vertical column from the large breakpoint. The active item is Quiet Sand with medium weight, not an ochre fill.
- **Header:** sticky, 64px tall, a bottom border at 60 percent, and a backdrop blur.

### Icons

Phosphor, exposed through a single module, at `light` weight by default and
`regular` only where a glyph must survive at 16px. Every icon in the codebase is
imported from that module, never from the library, so the weight and even the
library can change in one place. Icons default to 16px and never carry pointer
events.

### The Week Strip

Three aggregate figures in a single hairline-bordered row, divided by vertical
hairlines, each cell a large tabular number over a 12px muted label. It replaces
the hero-metric block: no gradients, no icons, no trend arrows, no cards. When
every figure is zero the whole strip removes itself rather than rendering empty
state theatre.

### Posters

A 2:3 frame with a hairline border and a Quiet Sand ground, filled before the
image arrives so nothing shifts. Hover scales the image to 1.03 over 500ms
inside the clip. When the provider has no artwork, the frame holds the title in
centred muted 12px text instead of a broken-image glyph.

## 6. Do's and Don'ts

### Do:

- **Do** keep Messenger Ochre to primary actions, the current selection, and state indicators. If two ochre areas compete on one screen, remove one.
- **Do** tint every neutral: hue 85 for the warm family, hue 262 to 265 for the ink and the night. The daylight card at `oklch(1 0 0)` is the one sanctioned pure value.
- **Do** reach for a hairline or a tonal step before a shadow. Cards get `ring-1 ring-foreground/10` and nothing else.
- **Do** give every interactive element its full state set: default, hover, focus-visible with the three-pixel ring, active, disabled, and where relevant loading and invalid.
- **Do** use skeletons shaped like the content that is coming, never a spinner parked in the middle of a page.
- **Do** import every icon from `src/components/icons.tsx`, never from `@phosphor-icons/react` directly.
- **Do** add every new user-visible string to both dictionaries in `src/lib/i18n/dictionaries.ts`. French is typed against English, so a missing translation fails the build.
- **Do** put `tabular-nums` on any number a reader compares vertically or that updates in place.
- **Do** let a section remove itself when it has nothing to show, the way the week strip does, rather than rendering an empty container.
- **Do** write empty states that name the next action: "no request yet, search for a title".

### Don't:

- **Don't** add a comment field, a chat, a review, a caption, or any other free-text input for members. No free text is the product, not a missing feature, and it is what removes moderation entirely.
- **Don't** build an uptime indicator, a "server online" badge, an availability alert, or a maintenance banner. Umbra runs on the same machine as the media server: if Umbra answers, the server is up.
- **Don't** introduce any payment affordance, donor name, contributor list, or wording that suggests contributing buys access. The funding goal is a number the administrator edits by hand.
- **Don't** add a request counter, a "me too" control, a popularity ranking, or an upvote on a title. One request per title, and the administrator sees a list to consider, not a contest.
- **Don't** build a library browser, a player, or a watch history. Umbra is not a second Plex.
- **Don't** let any wording imply that an aired episode is a downloaded one. The vocabulary is scheduled, aired, to add, on the server.
- **Don't** use `border-left` or `border-right` above one pixel as a coloured accent stripe on cards, list items, or alerts. Use a full ring, a background tint, or nothing.
- **Don't** apply `background-clip: text` with a gradient. Emphasis comes from weight and size, never from gradient text.
- **Don't** use `backdrop-blur` outside the sticky header and the nav pill. No glass cards, no frosted panels.
- **Don't** build the big-number-plus-gradient hero metric block. The week strip is the answer, and it is three plain figures on hairlines.
- **Don't** fill a screen with identically sized icon-heading-text cards. The home page grid is deliberately uneven.
- **Don't** put Instrument Serif on anything but the h1, and don't put uppercase wide tracking on buttons, badges, or nav items.
- **Don't** ship a solid red button. Destructive intent is a 10 percent wash with red text.
- **Don't** reach for a modal before exhausting the inline alternative. The only dialogs in the system are the discovery result and genuine confirmations.
- **Don't** animate anything that does not convey state, and never animate a layout property. Transitions run 150 to 250ms; the poster scale at 500ms is the outer limit.
- **Don't** borrow the reserved chart hues (green 155, violet 300, gold 90) for interface colour. No chart component ships yet.
- **Don't** use an em dash or an emoji anywhere: code, comments, documentation, or interface copy.
