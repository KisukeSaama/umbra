import "server-only";

import { cache } from "react";

import {
  isAnime,
  matchAnime,
  mergeSimilar,
  pickTmdbMatch,
  searchableTitle,
  withMalScore,
} from "@/lib/discovery/anime";
import type { MediaKind, MediaSummary } from "@/lib/providers/metadata";
import { myAnimeList } from "@/lib/providers/myanimelist";
import { tmdbProvider } from "@/lib/providers/tmdb";

/**
 * What goes with one title: the answer behind "more like this", the shelf
 * seeded on a request, and every seed of the personal shelf.
 *
 * TMDB answers for everything. For an anime it answers badly: its list is
 * built from keywords and genres, so Death Note gets whatever is animated and
 * popular this year and never Code Geass. MyAnimeList members vote on pairs of
 * titles, and that is the question asked here, so an anime is answered by them
 * first and TMDB only fills the rest of the shelf.
 *
 * Nothing throws: a source that fails costs its half of the shelf, and a title
 * MAL cannot be matched to falls back on TMDB alone. Janus holds the cache, so
 * the calls made the first time a title is opened are free for a day after.
 */

/** A provider list is twenty titles long; the shelf keeps that length. */
const SHELF_SIZE = 20;

/**
 * How many MAL recommendations are looked up on TMDB. Each one is a search, and
 * past this point the votes behind a pair are thin enough to be noise.
 */
const RESOLVED = 12;

export const similarTitles = cache(async function similarTitles(
  kind: MediaKind,
  providerId: string,
  language?: string,
): Promise<MediaSummary[]> {
  const [seed, fromTmdb] = await Promise.all([
    tmdbProvider.details(kind, providerId, language).catch(() => null),
    tmdbProvider.recommendations(kind, providerId, language).catch((error) => {
      console.warn("[similar] provider recommendations unavailable", error);
      return [] as MediaSummary[];
    }),
  ]);
  if (!seed || !isAnime(seed)) return fromTmdb;

  const fromMembers = await animeRecommendations(seed, language).catch(
    (error) => {
      console.warn("[similar] anime recommendations unavailable", error);
      return [] as MediaSummary[];
    },
  );
  return mergeSimilar(seed, fromMembers, fromTmdb, SHELF_SIZE);
});

/** What MAL members recommend after this anime, as TMDB titles. */
async function animeRecommendations(
  seed: MediaSummary,
  language?: string,
): Promise<MediaSummary[]> {
  const match = await malEntryOf(seed);
  if (!match) return [];

  const votes = await myAnimeList.recommendations(match.malId);
  const found = await Promise.all(
    votes.slice(0, RESOLVED).map((vote) => tmdbTitleOf(vote.title, language)),
  );
  return scoredAnime(found);
}

/**
 * Resolved anime, once each, with MAL's score.
 *
 * The score is read from the MAL entry that is the TMDB title, not from the
 * entry that led to it: TMDB folds every season of a show into one title, so
 * a sequel recommended or ranked on MAL lands on the whole show, and its own
 * score is not the show's.
 */
export async function scoredAnime(
  rows: (MediaSummary | null)[],
  excluded: Set<string> = new Set(),
): Promise<MediaSummary[]> {
  const seen = new Set(excluded);
  const unique = rows.filter((row): row is MediaSummary => {
    if (!row) return false;
    const key = `${row.kind}:${row.providerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Promise.all(unique.map(withAnimeScore));
}

/**
 * A TMDB title with MAL's score when it is an anime MAL can be matched to, and
 * as it came otherwise. What the title page shows, so an anime reads the same
 * number there as on the card that led to it.
 */
export async function withAnimeScore(
  summary: MediaSummary,
): Promise<MediaSummary> {
  if (!isAnime(summary)) return summary;
  const match = await malEntryOf(summary).catch((error) => {
    console.warn("[similar] anime score unavailable", error);
    return null;
  });
  return withMalScore(summary, match);
}

/**
 * The TMDB title a MAL title names, or nothing. One search, answered by the
 * gateway's cache after the first time; a failed search is a title not found.
 */
export async function tmdbTitleOf(
  malTitle: string,
  language?: string,
  kind?: MediaKind,
): Promise<MediaSummary | null> {
  const rows = await tmdbProvider
    .search(searchableTitle(malTitle), language)
    .catch(() => []);
  return pickTmdbMatch(rows, kind);
}

/**
 * The MAL entry for a TMDB anime. The original title is tried first: TMDB
 * keeps it in Japanese and MAL finds it exactly, where a French title is one
 * MAL may not know.
 */
async function malEntryOf(seed: MediaSummary) {
  const names = [seed.originalTitle, seed.title].filter(
    (name): name is string => Boolean(name),
  );
  // A search MAL refuses is one name that did not match, not the end of the
  // lookup: the other name is still worth asking.
  for (const name of names) {
    const found = await myAnimeList.search(name).catch(() => []);
    const match = matchAnime(seed, found);
    if (match) return match;
  }
  return null;
}
