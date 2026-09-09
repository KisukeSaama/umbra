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
 * in. "Kaiju No. 8" and "Kaiji" are not re-cuts, and neither is a season
 * folder that merely starts with those letters.
 */
const MARKERS: Record<AlternateCut, RegExp> = {
  kai: /(?:^|[^\p{L}\p{N}])kai(?:$|[^\p{L}\p{N}])/iu,
  yabai: /(?:^|[^\p{L}\p{N}])yabai(?:$|[^\p{L}\p{N}])/iu,
};

/** Does this server title carry a re-cut marker at all? */
export function hasCutMarker(libraryTitle: string | null | undefined): boolean {
  if (!libraryTitle) return false;
  return ALTERNATE_CUTS.some((cut) => MARKERS[cut].test(libraryTitle));
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

  for (const cut of ALTERNATE_CUTS) {
    const marker = MARKERS[cut];
    if (!marker.test(libraryTitle)) continue;
    if (providerTitles.some((title) => title && marker.test(title))) continue;
    return cut;
  }

  return null;
}
