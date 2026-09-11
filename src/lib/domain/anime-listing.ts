import "server-only";

import { fitsMalGenres, malGenreFilter } from "@/lib/discovery/anime";
import { worthSuggesting } from "@/lib/discovery/blend";
import { releasedWithin } from "@/lib/discovery/moods";
import { scoredAnime, tmdbTitleOf } from "@/lib/domain/similar";
import type { DiscoverQuery, MediaSummary } from "@/lib/providers/metadata";
import { myAnimeList, RANKING_PAGE } from "@/lib/providers/myanimelist";
import { RATING_FLOOR } from "@/lib/providers/tmdb";

/**
 * The picker's listing when the member asked for anime.
 *
 * TMDB answers "anime, make me laugh" with its Animation genre, a Japanese
 * original language and a sort by score: a list of whatever has the most votes
 * on a site where anime are few. MAL ranks anime by the score its own members
 * give, and files them under finer genres, so the listing is drawn from there
 * and each title looked up on TMDB before it is shown.
 *
 * A page of the ranking is picked at random, like the TMDB roll, so a second
 * roll is a second answer. The caller falls back on TMDB when this comes back
 * short: a narrow mood has few anime in the top of the ranking.
 */

/** How deep into the ranking a roll may reach, in pages. */
const RANKING_PAGES = 3;

/** How many ranked titles are looked up on TMDB: one search each. */
const RESOLVED = 16;

export async function animeListing(
  query: DiscoverQuery,
  excluded: Set<string> = new Set(),
): Promise<MediaSummary[]> {
  const filter = malGenreFilter(query);
  const page = Math.floor(Math.random() * RANKING_PAGES);
  const ranked = await myAnimeList.ranking(query.kind, page * RANKING_PAGE);
  // The era is read on MAL's start date before anything is looked up: a
  // search spent on a title the era then throws out is a search for nothing.
  const candidates = shuffle(
    ranked.filter(
      (anime) =>
        fitsMalGenres(anime, filter) && releasedWithin(anime.startDate, query),
    ),
  ).slice(0, RESOLVED);

  const found = await Promise.all(
    candidates.map((anime) =>
      tmdbTitleOf(anime.title, query.language, query.kind),
    ),
  );

  // The ranking is full of sequels, which land on the show they continue, so
  // the same title comes back several times; it is kept once, with the score
  // of the show rather than of the season that ranked. The quality floor then
  // reads the number the card will show.
  const floor = query.voteAverageGte ?? RATING_FLOOR;
  // The ranking knows no era, so the one asked for is applied on the way out.
  return (await scoredAnime(found, excluded, candidates)).filter(
    (row) =>
      worthSuggesting(row, floor) && releasedWithin(row.releaseDate, query),
  );
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}
