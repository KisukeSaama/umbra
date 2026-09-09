/**
 * Re-cuts: the same series, renumbered.
 *
 * Some shows sit on the server under a name the provider never gave them:
 * "Kai", "Yabai" and the like are fan re-cuts that drop the filler and
 * renumber what is left. The media server still matches them to the original
 * series, so the index answers with a hundred episodes where the provider
 * lists a thousand, and everything downstream reads that as a shortfall: the
 * search calls the series partial, the ladder marks every season short, and
 * the page offers to ask for episodes that were removed on purpose.
 *
 * None of that is true. The series is here, whole, in another cut. So the cut
 * is named once, here, and the three places that would otherwise lie read it:
 * the state, the ladder, and the wording on the page.
 *
 * A pure leaf, like the season rules next to it: no database, no network.
 */

/** The re-cuts the server is known to carry. */
export const ALTERNATE_CUTS = ["kai", "yabai"] as const;

export type AlternateCut = (typeof ALTERNATE_CUTS)[number];

/**
 * The marker as a whole word, in any script the title happens to be written
 * in. "Kaiju No. 8", "Kaiji", "Jujutsu Kaisen" and "Le pacte des Yokai" are not
 * re-cuts: the letters are there, the word is not.
 */
const MARKERS: Record<AlternateCut, RegExp> = {
  kai: /(?:^|[^\p{L}\p{N}])kai(?:$|[^\p{L}\p{N}])/iu,
  yabai: /(?:^|[^\p{L}\p{N}])yabai(?:$|[^\p{L}\p{N}])/iu,
};

/**
 * The same word, with its hat off.
 *
 * These names are filed by hand, and a hand writes them the way it reads them:
 * "Bleach KAI", "Naruto Kai", "Dragon Ball Yabai". They are one word, so the
 * accents come off before the marker is looked for, and every spelling of it
 * answers the same.
 */
function plain(title: string): string {
  return title.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Does this server title carry a re-cut marker at all? */
export function hasCutMarker(libraryTitle: string | null | undefined): boolean {
  if (!libraryTitle) return false;
  const title = plain(libraryTitle);
  return ALTERNATE_CUTS.some((cut) => MARKERS[cut].test(title));
}

/**
 * The cut a server title is in, or nothing when it is the series itself.
 *
 * The provider titles are what keeps a real show out of this: "Dragon Ball Z
 * Kai" is its own series and the provider says so, so the word in the server
 * title is its name rather than something the server added. Only a marker the
 * provider does not carry means a re-cut.
 *
 * No provider title to compare against reads as a re-cut, which is the safe
 * way round: it states the cut and stops asking for episodes, rather than
 * inventing a shortfall out of a numbering that was never going to match.
 */
export function alternateCutOf(
  libraryTitle: string | null | undefined,
  providerTitles: readonly (string | null | undefined)[] = [],
): AlternateCut | null {
  if (!libraryTitle) return null;

  const title = plain(libraryTitle);
  const provider = providerTitles
    .filter((name): name is string => Boolean(name))
    .map(plain);

  for (const cut of ALTERNATE_CUTS) {
    const marker = MARKERS[cut];
    if (!marker.test(title)) continue;
    if (provider.some((name) => marker.test(name))) continue;
    return cut;
  }

  return null;
}

/**
 * The series a re-cut is a re-cut of, as far as its name says.
 *
 * A re-cut is filed as the original name with the marker stuck on the end:
 * "Naruto Kai", "Dragon Ball Z Yabai", "Bleach KAI". Taking the marker word out
 * leaves what to look the series up under. Nothing else is touched, so a title
 * that carries no marker gets no name back rather than a guess.
 */
export function titleWithoutCut(
  libraryTitle: string | null | undefined,
): string | null {
  if (!libraryTitle) return null;

  const words = libraryTitle.split(/\s+/u).filter(Boolean);
  const kept = words.filter((word) => !isMarkerWord(word));
  if (kept.length === words.length || kept.length === 0) return null;

  // "One Piece (Yabai)" leaves its bracket behind, and a trailing colon or
  // dash is the same story. What is left is only ever compared and searched
  // with, and both read punctuation as nothing.
  return kept
    .join(" ")
    .replace(/[^\p{L}\p{N}]+$/u, "")
    .trim();
}

/** One word of a title, brackets and punctuation set aside, is the marker. */
function isMarkerWord(word: string): boolean {
  const bare = plain(word)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return (ALTERNATE_CUTS as readonly string[]).includes(bare);
}

/**
 * Two names for the same series.
 *
 * Accents off, case off, and everything that is not a letter or a digit read
 * as one space: "Naruto Shippūden" and "Naruto Shippuden" are the same
 * name, and so are "Reborn!" and "Reborn". The comparison is deliberately
 * blunt on punctuation and deliberately strict on words, because the whole
 * point is to refuse a link rather than invent one.
 */
export function sameTitle(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = titleKey(a);
  return left.length > 0 && left === titleKey(b);
}

/**
 * A name that is the other one, and then some.
 *
 * The fallback for a series the provider files under a longer name than the
 * server does: "Boruto" against "Boruto: Naruto Next Generations". It is only
 * ever used when exactly one candidate answers to it, since "Dragon Ball" is
 * the beginning of four different series and picking one of them would be a
 * guess dressed up as a match.
 */
export function beginsWithTitle(
  candidate: string | null | undefined,
  base: string | null | undefined,
): boolean {
  const start = titleKey(base);
  if (start.length === 0) return false;
  return titleKey(candidate).startsWith(`${start} `);
}

function titleKey(title: string | null | undefined): string {
  if (!title) return "";
  return plain(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
