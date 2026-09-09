import "server-only";

import { desc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { media, mediaRequests, type MediaType } from "@/lib/db/schema";
import { type CatalogResult, decorate } from "@/lib/domain/catalog";
import {
  randomAvailableByGenres,
  randomAvailableItems,
  type RecentItem,
} from "@/lib/domain/library";
import { topGenres } from "@/lib/domain/taste";
import {
  discoverQueriesFor,
  type Mood,
  type PickerChoice,
} from "@/lib/discovery/moods";
import type {
  DiscoverQuery,
  Genre,
  MediaKind,
  MediaSummary,
} from "@/lib/providers/metadata";
import { tmdbProvider } from "@/lib/providers/tmdb";

/**
 * The shelves.
 *
 * Every one of them is a provider listing decorated with what Umbra knows, so a
 * card always says whether the title is here, already asked for, or absent. The
 * point of the page is that browsing and asking are the same gesture.
 *
 * Two rules hold this together. Nothing is cached here: the gateway owns the
 * response cache and this project does not get a second one. And nothing throws:
 * a listing that fails comes back empty, so one refused call costs a rail rather
 * than the page.
 */

/**
 * How deep a roll is allowed to reach. The narrowest mood holds a handful of
 * pages once the vote floor is applied, so this stays small enough that most
 * rolls land on a page that exists.
 */
const ROLL_PAGES = 4;

export type Shelf = {
  key: string;
  items: CatalogResult[];
};

async function quietly(
  work: () => Promise<MediaSummary[]>,
): Promise<CatalogResult[]> {
  try {
    return await decorate(await work());
  } catch (error) {
    console.warn("[discovery] shelf unavailable", error);
    return [];
  }
}

export const trendingShelf = cache(async function trendingShelf(
  language?: string,
): Promise<CatalogResult[]> {
  return quietly(() => tmdbProvider.trending(language));
});

export const upcomingShelf = cache(async function upcomingShelf(
  language?: string,
): Promise<CatalogResult[]> {
  return quietly(() => tmdbProvider.upcoming("movie", language));
});

export const airingShelf = cache(async function airingShelf(
  language?: string,
): Promise<CatalogResult[]> {
  return quietly(() => tmdbProvider.upcoming("tv", language));
});

/**
 * Recommendations seeded on something the member asked for themselves.
 *
 * Personal without being intrusive: it reads one row this person created, not
 * what they watched. When there is no request yet, there is no shelf, and the
 * empty state on the page says what to do about it.
 */
export const becauseYouAsked = cache(async function becauseYouAsked(
  accountId: string,
  language?: string,
): Promise<{ seed: string; items: CatalogResult[] } | null> {
  const [seed] = await db()
    .select({
      providerId: media.providerId,
      mediaType: media.mediaType,
      title: media.title,
    })
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(eq(mediaRequests.requestedBy, accountId))
    .orderBy(desc(mediaRequests.createdAt))
    .limit(1);

  if (!seed) return null;
  const items = await quietly(() =>
    tmdbProvider.recommendations(seed.mediaType, seed.providerId, language),
  );
  return items.length > 0 ? { seed: seed.title, items } : null;
});

/**
 * The shelf the taste profile feeds.
 *
 * It asks for both kinds and interleaves them, and it says nothing about what
 * the member watched: the genres are already an aggregate by the time they get
 * here, and the page never explains itself with a title.
 */
export const forYouShelf = cache(async function forYouShelf(
  accountId: string,
  language?: string,
): Promise<CatalogResult[]> {
  const [movieGenres, showGenres] = await Promise.all([
    topGenres(accountId, "movie"),
    topGenres(accountId, "tv"),
  ]);
  if (movieGenres.length === 0 && showGenres.length === 0) return [];

  const [movies, shows] = await Promise.all([
    movieGenres.length
      ? quietly(() =>
          tmdbProvider.discoverBy({
            kind: "movie",
            genreIds: movieGenres,
            sortBy: "rating",
            language,
          }),
        )
      : Promise.resolve([]),
    showGenres.length
      ? quietly(() =>
          tmdbProvider.discoverBy({
            kind: "tv",
            genreIds: showGenres,
            sortBy: "rating",
            language,
          }),
        )
      : Promise.resolve([]),
  ]);

  return interleave(movies, shows).slice(0, 18);
});

export const genreShelf = cache(async function genreShelf(
  kind: MediaKind,
  genreId: number,
  language?: string,
): Promise<CatalogResult[]> {
  return quietly(() =>
    tmdbProvider.discoverBy({
      kind,
      genreIds: [genreId],
      sortBy: "rating",
      language,
    }),
  );
});

export const genreOptions = cache(async function genreOptions(
  kind: MediaKind,
  language?: string,
): Promise<Genre[]> {
  try {
    return await tmdbProvider.genres(kind, language);
  } catch (error) {
    console.warn("[discovery] genre list unavailable", error);
    return [];
  }
});

export type GuidedSelection = {
  /** Already here: the evening can start now. */
  tonight: RecentItem[];
  /** Not here: worth asking for. */
  ideas: CatalogResult[];
};

/**
 * The answer to "I do not know what to watch".
 *
 * Half of it is drawn from the server, so there is something to press play on
 * straight away, and half from the provider, so there is something to ask for.
 * Both halves come from the same three closed answers, and neither of them ever
 * involved typing a word.
 */
export async function guidedSelection(
  choice: PickerChoice,
  language?: string,
): Promise<GuidedSelection> {
  const queries = discoverQueriesFor(choice);

  const tonight = (
    await Promise.all(
      queries.map((query) =>
        randomAvailableByGenres(
          query.kind,
          query.genreIds ?? [],
          queries.length > 1 ? 2 : 3,
          query.excludeGenreIds ?? [],
        ),
      ),
    )
  ).flat();

  const found = await Promise.all(
    queries.map((query) => rolledPage(query, language)),
  );

  const ideas = found
    .flat()
    .filter((item) => item.availability === "absent")
    .slice(0, 6);

  // A library with nothing matching still owes an answer.
  const filler =
    tonight.length === 0 ? await randomAvailableItems(3) : ([] as RecentItem[]);

  return { tonight: tonight.length > 0 ? tonight.slice(0, 3) : filler, ideas };
}

/**
 * One listing, taken from a page picked at random so a second roll is a second
 * answer rather than the same six cards.
 *
 * A narrow mood has few pages, and asking past the last one returns nothing at
 * all: rather than hand back an empty picker, the first page answers instead.
 */
async function rolledPage(
  query: DiscoverQuery,
  language?: string,
): Promise<CatalogResult[]> {
  const page = 1 + Math.floor(Math.random() * ROLL_PAGES);
  const rolled = await quietly(() =>
    tmdbProvider.discoverBy({ ...query, language, page }),
  );
  if (rolled.length > 0 || page === 1) return rolled;
  return quietly(() =>
    tmdbProvider.discoverBy({ ...query, language, page: 1 }),
  );
}

/** Alternates two lists so a mixed shelf does not read as two blocks. */
function interleave<T>(left: T[], right: T[]): T[] {
  const out: T[] = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index]) out.push(left[index]);
    if (right[index]) out.push(right[index]);
  }
  return out;
}

export type { Mood, MediaType };
