import "server-only";

import { cache } from "react";

import {
  isAnime,
  matchAnime,
  mergeSimilar,
  pickTmdbMatch,
  searchableTitle,
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
    votes.slice(0, RESOLVED).map(async (vote) => {
      const rows = await tmdbProvider
        .search(searchableTitle(vote.title), language)
        .catch(() => []);
      return pickTmdbMatch(rows);
    }),
  );
  return found.filter((row): row is MediaSummary => row !== null);
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
  for (const name of names) {
    const match = matchAnime(seed, await myAnimeList.search(name));
    if (match) return match;
  }
  return null;
}
