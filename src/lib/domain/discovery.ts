import "server-only";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  accounts,
  libraryItems,
  media,
  mediaRequests,
  requestFollowers,
  type MediaType,
} from "@/lib/db/schema";
import { type CatalogResult, decorate } from "@/lib/domain/catalog";
import {
  availableByProviderIds,
  randomAvailableByGenres,
  type RecentItem,
} from "@/lib/domain/library";
import { HISTORY_LIMIT, topGenres, WINDOW_DAYS } from "@/lib/domain/taste";
import {
  blend,
  keyOf,
  sampleTop,
  type SeedAnswer,
  seedsFrom,
  type SeedTitle,
  worthSuggesting,
} from "@/lib/discovery/blend";
import {
  discoverQueriesFor,
  matchesQuery,
  type Mood,
  type PickerChoice,
} from "@/lib/discovery/moods";
import type {
  DiscoverQuery,
  Genre,
  MediaKind,
  MediaSummary,
} from "@/lib/providers/metadata";
import { plexLibrary } from "@/lib/providers/plex";
import { RATING_FLOOR, tmdbProvider } from "@/lib/providers/tmdb";

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

/** Below this, a half of the picker reads as a mistake rather than a selection. */
const THIN = 3;

/** The floor a narrow mood falls back to before it comes back nearly empty. */
const RELAXED_VOTES = 100;

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
    .from(requestFollowers)
    .innerJoin(mediaRequests, eq(mediaRequests.id, requestFollowers.requestId))
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(eq(requestFollowers.accountId, accountId))
    .orderBy(desc(requestFollowers.createdAt))
    .limit(1);

  if (!seed) return null;
  // The provider's list carries no floor of its own, and this shelf is Umbra
  // putting titles forward, so it is held to the same bar as the others.
  const items = await quietly(async () =>
    (
      await tmdbProvider.recommendations(
        seed.mediaType,
        seed.providerId,
        language,
      )
    ).filter((item) => worthSuggesting(item, RATING_FLOOR)),
  );
  return items.length > 0 ? { seed: seed.title, items } : null;
});

/**
 * The shelf shaped by what the member watched.
 *
 * Seeded on titles: the last few things watched, each asked what goes with it,
 * the answers merged by `blend` (see `@/lib/discovery/blend`). The history is
 * read live and dropped with the render, like the followed shows on the home
 * page, and the page never explains itself with a title.
 *
 * Every seed is one provider call, answered by the gateway's cache for hours
 * after the first. When the history yields nothing, because the server did not
 * answer or nothing was watched, the genre profile answers instead: it is kept
 * by the sync and is the last thing known without asking the server.
 */
export const forYouShelf = cache(async function forYouShelf(
  accountId: string,
  language?: string,
): Promise<CatalogResult[]> {
  const personal = await personalAnswers(accountId, language);
  if (!personal) return genreShelf(accountId, language);

  const shelf = blend(personal.answers, {
    watched: personal.watched,
    ratingFloor: RATING_FLOOR,
  });
  if (shelf.length === 0) return genreShelf(accountId, language);
  return quietly(async () => shelf);
});

/**
 * The provider's answers for one member's recent titles, or nothing when the
 * history yields no seed. Memoised per render: the shelf and the picker both
 * ask, and this is request-scoped deduplication rather than a cache tier.
 */
const personalAnswers = cache(async function personalAnswers(
  accountId: string,
  language?: string,
): Promise<{ answers: SeedAnswer[]; watched: Set<string> } | null> {
  const { history, watched } = await recentTitles(accountId);
  const seeds = seedsFrom(history);
  if (seeds.length === 0) return null;

  const answers = await Promise.all(
    seeds.map(async (seed) => ({
      seed,
      items: await rows(() =>
        tmdbProvider.recommendations(seed.kind, seed.providerId, language),
      ),
    })),
  );
  return { answers, watched };
});

/**
 * Everything the seeds proposed, ranked, with no card limit per seed: the
 * picker filters it by mood afterwards, and a cap applied before the filter
 * would throw away exactly the titles the mood was looking for.
 */
async function personalRanking(
  accountId: string,
  language?: string,
): Promise<MediaSummary[]> {
  const personal = await personalAnswers(accountId, language);
  if (!personal) return [];
  return blend(personal.answers, {
    watched: personal.watched,
    ratingFloor: RATING_FLOOR,
    size: Number.POSITIVE_INFINITY,
    perSeed: Number.POSITIVE_INFINITY,
  });
}

/**
 * What one member watched in the profile window, as provider titles.
 *
 * Ordered most recent first, an episode standing for its show. Titles the index
 * has no provider id for are dropped: nothing can be asked about them. The list
 * lives for the length of one render.
 */
async function recentTitles(
  accountId: string,
): Promise<{ history: SeedTitle[]; watched: Set<string> }> {
  const empty = { history: [], watched: new Set<string>() };
  const [account] = await db()
    .select({ plexAccountId: accounts.plexAccountId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) return empty;

  let keys: string[];
  try {
    const events = await plexLibrary.watchHistory({
      plexAccountId: account.plexAccountId,
      since: new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000),
      limit: HISTORY_LIMIT,
    });
    keys = events.map((event) => event.grandparentRatingKey ?? event.ratingKey);
  } catch (error) {
    console.warn("[discovery] watch history unavailable", error);
    return empty;
  }
  if (keys.length === 0) return empty;

  const found = await db()
    .select({
      ratingKey: libraryItems.ratingKey,
      kind: libraryItems.kind,
      tmdbId: libraryItems.tmdbId,
    })
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.ratingKey, [...new Set(keys)]),
        inArray(libraryItems.kind, ["movie", "show"]),
        isNotNull(libraryItems.tmdbId),
      ),
    );

  const byKey = new Map(
    found.map((row) => [
      row.ratingKey,
      {
        kind: (row.kind === "movie" ? "movie" : "tv") as MediaKind,
        providerId: row.tmdbId as string,
      },
    ]),
  );
  const history = keys
    .map((key) => byKey.get(key))
    .filter((title): title is SeedTitle => title !== undefined);

  return { history, watched: new Set(history.map(keyOf)) };
}

/** A listing that fails comes back empty, undecorated. */
async function rows(
  work: () => Promise<MediaSummary[]>,
): Promise<MediaSummary[]> {
  try {
    return await work();
  } catch (error) {
    console.warn("[discovery] recommendations unavailable", error);
    return [];
  }
}

/**
 * The shelf the genre profile feeds, when the history cannot seed one.
 *
 * It asks for both kinds and interleaves them.
 */
async function genreShelf(
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
}

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
 * Both halves come from the same four closed answers, and neither of them ever
 * involved typing a word.
 */
export async function guidedSelection(
  choice: PickerChoice,
  language?: string,
  accountId?: string,
): Promise<GuidedSelection> {
  const queries = discoverQueriesFor(choice);
  const personal = accountId ? await personalRanking(accountId, language) : [];
  const count = queries.length > 1 ? 2 : 3;

  /*
   * Each half starts from the member and is completed by the mood.
   *
   * The ranking built from what they watched is filtered by the four answers:
   * what passes is a title that fits the evening and resembles their taste,
   * which is the best answer the picker can give. When it runs short, a quiet
   * week or a mood far from their habits, the mood listing fills the rest as it
   * always did.
   */
  const halves = await Promise.all(
    queries.map(async (query) => {
      const fits = personal.filter((item) => matchesQuery(item, query));
      const [onServer, random, rolled, fitting] = await Promise.all([
        availableByProviderIds(
          query.kind,
          fits.map((item) => item.providerId),
        ),
        randomAvailableByGenres(
          query.kind,
          query.genreIds ?? [],
          count * 2,
          query.excludeGenreIds ?? [],
          query.requireGenreIds ?? [],
        ),
        rolledPage(query, language),
        quietly(async () => fits),
      ]);

      const tonight = uniqueBy(
        [...sampleTop(onServer, count, PERSONAL_POOL), ...random],
        (item) => item.ratingKey,
      ).slice(0, count);

      const absent = (items: CatalogResult[]) =>
        items.filter((item) => item.availability === "absent");
      const ideas = uniqueBy(
        [
          ...sampleTop(absent(fitting), IDEAS / queries.length, PERSONAL_POOL),
          ...absent(rolled),
        ],
        (item) => `${item.kind}:${item.providerId}`,
      );

      return { tonight, ideas };
    }),
  );

  // Nothing is substituted when the server holds nothing for this mood. Three
  // titles drawn at random under a heading that answers a question they were
  // not chosen for is worse than an empty half: it reads as the answer, and it
  // is what made "make me laugh" reply with a horror film. The picker shows the
  // half it has.
  const [first, second] = halves;
  return {
    tonight: halves.flatMap((half) => half.tonight).slice(0, 3),
    ideas: (second ? interleave(first.ideas, second.ideas) : first.ideas).slice(
      0,
      IDEAS,
    ),
  };
}

/** How many ideas the picker shows. */
const IDEAS = 6;

/** How far down the personal ranking a roll may draw. */
const PERSONAL_POOL = 8;

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
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
  if (rolled.length >= THIN) return rolled;

  const first =
    page === 1
      ? rolled
      : await quietly(() =>
          tmdbProvider.discoverBy({ ...query, language, page: 1 }),
        );
  if (first.length >= THIN) return first;

  // Still thin. The narrow moods stack their filters, and a runtime ceiling on
  // top of an origin and a vote floor leaves a shelf of one card. The vote
  // count is the filter to give up first: it is there to keep the noise out,
  // not to decide what counts as good, and the answers the member gave are not.
  // What is given up is how widely a title was seen, never how well it was
  // received: the provider holds a score floor under every listing, and a
  // shelf that came back thin is exactly where a suggestion must not slip.
  return quietly(() =>
    tmdbProvider.discoverBy({
      ...query,
      language,
      page: 1,
      voteCountGte: RELAXED_VOTES,
    }),
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
