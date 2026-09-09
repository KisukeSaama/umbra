import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  episodes,
  libraryItems,
  media,
  mediaRequests,
  trackedSeries,
  type MediaType,
} from "@/lib/db/schema";
import { availabilityOf, type Availability } from "@/lib/domain/availability";
import { episodeCountsBySeason, episodesOnServer } from "@/lib/domain/library";
import { isSeriesIncomplete } from "@/lib/domain/seasons";
import { settledIndex } from "@/lib/domain/settled";
import type { MediaKind, MediaSummary } from "@/lib/providers/metadata";
import { posterUrl, tmdbProvider } from "@/lib/providers/tmdb";

/** Search: the heart of Umbra. The states themselves live one file away. */
export type { Availability };

export type CatalogResult = {
  providerId: string;
  kind: MediaKind;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  year: number | null;
  posterUrl: string | null;
  availability: Availability;
};

/** Library kind matching a media kind. */
function libraryKindOf(kind: MediaKind) {
  return kind === "movie" ? "movie" : "show";
}

export async function searchCatalog(
  query: string,
  language?: string,
): Promise<CatalogResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const summaries = await tmdbProvider.search(trimmed, language);
  return decorate(summaries);
}

/** Adds server presence and request state to raw provider results. */
export async function decorate(
  summaries: MediaSummary[],
): Promise<CatalogResult[]> {
  if (summaries.length === 0) return [];

  const providerIds = [
    ...new Set(summaries.map((summary) => summary.providerId)),
  ];
  const [inLibrary, requested, tracked, settled] = await Promise.all([
    libraryIndex(providerIds),
    requestedIndex(providerIds),
    trackerGapIndex(providerIds),
    settledIndex(providerIds),
  ]);
  const incomplete = await incompleteIndex(summaries, inLibrary, tracked);

  return summaries.map((summary) => ({
    providerId: summary.providerId,
    kind: summary.kind,
    title: summary.title,
    originalTitle: summary.originalTitle,
    overview: summary.overview,
    year: yearOf(summary.releaseDate),
    posterUrl: posterUrl(summary.posterPath),
    availability: stateOf(summary, inLibrary, requested, incomplete, settled),
  }));
}

/** State of one specific title, without going through a search. */
export async function availabilityFor(
  kind: MediaKind,
  providerId: string,
): Promise<Availability> {
  const summary = { providerId, kind };
  const [inLibrary, requested, tracked, settled] = await Promise.all([
    libraryIndex([providerId]),
    requestedIndex([providerId]),
    trackerGapIndex([providerId]),
    settledIndex([providerId]),
  ]);
  const incomplete = await incompleteIndex([summary], inLibrary, tracked);
  return stateOf(summary, inLibrary, requested, incomplete, settled);
}

/**
 * The four indexes, read against one title.
 *
 * The last one is the only one that does not come from a scan: it carries what
 * the administration answered since the last pass, and it can only ever take a
 * shortfall away. A title nobody has asked about is decided exactly as before.
 */
function stateOf(
  summary: Pick<MediaSummary, "providerId" | "kind">,
  inLibrary: Set<string>,
  requested: Set<string>,
  incomplete: Set<string>,
  settled: Set<string>,
): Availability {
  const key = `${summary.kind}:${summary.providerId}`;
  return availabilityOf({
    inLibrary: inLibrary.has(
      `${libraryKindOf(summary.kind)}:${summary.providerId}`,
    ),
    incomplete: incomplete.has(key) && !settled.has(key),
    requested: requested.has(key),
  });
}

/**
 * Does the server hold this title, as the last sync saw it.
 *
 * The one question asked before a request may be declared fulfilled. The answer
 * comes from `library_item`, filled by the sync, never from a claim made in the
 * administration: a title said to be there while it is not is a title the
 * search offers again, and the same ask comes back.
 */
export async function isInLibrary(
  kind: MediaKind,
  providerId: string,
): Promise<boolean> {
  const index = await libraryIndex([providerId]);
  return index.has(`${libraryKindOf(kind)}:${providerId}`);
}

/** Keys `movie:335984` / `show:209867` present on the server. */
async function libraryIndex(providerIds: string[]): Promise<Set<string>> {
  const rows = await db()
    .select({ tmdbId: libraryItems.tmdbId, kind: libraryItems.kind })
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.tmdbId, providerIds),
        inArray(libraryItems.kind, ["movie", "show"] as const),
      ),
    );

  return new Set(
    rows.filter((row) => row.tmdbId).map((row) => `${row.kind}:${row.tmdbId}`),
  );
}

/** Keys `movie:335984` / `tv:209867` already requested (request not rejected). */
async function requestedIndex(providerIds: string[]): Promise<Set<string>> {
  const rows = await db()
    .select({ providerId: media.providerId, mediaType: media.mediaType })
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(
      and(
        inArray(media.providerId, providerIds),
        ne(mediaRequests.status, "rejected"),
      ),
    );

  return new Set(rows.map((row) => `${row.mediaType}:${row.providerId}`));
}

/**
 * Series the tracker knows to be short, by provider id.
 *
 * Read from the tracker, which already keeps the broadcast calendar of the
 * shows it follows next to what the server answered: an episode that has aired
 * and has not arrived is exactly the gap a member must not be told is filled.
 * One join, no provider call, so it costs a search nothing.
 *
 * It only covers followed series, which is why the season count answers for
 * the others: see `incompleteIndex`.
 */
async function trackerGapIndex(providerIds: string[]): Promise<Set<string>> {
  const rows = await db()
    .selectDistinct({
      providerId: media.providerId,
      mediaType: media.mediaType,
    })
    .from(episodes)
    .innerJoin(trackedSeries, eq(trackedSeries.id, episodes.seriesId))
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .where(
      and(
        inArray(media.providerId, providerIds),
        eq(episodes.status, "aired_missing"),
        eq(episodes.plexAvailable, false),
      ),
    );

  // Keyed by kind as well: a movie and a series can carry the same id.
  return new Set(rows.map((row) => `${row.mediaType}:${row.providerId}`));
}

/**
 * Series on the server that are missing something, from both things that know.
 *
 * Counting seasons is the truth a title page shows, so search reads it too:
 * it said "available on the server" for a series holding three episodes out of
 * eight as long as no tracker followed it, and the page it led to then took
 * that back season by season. The tracker still answers alongside, because a
 * provider that cannot be reached leaves nothing to count and its calendar
 * remains.
 *
 * Only series already on the server are counted, so the extra provider calls
 * are as many as there are shelved shows among the results, usually none or
 * one, and every one of them goes through the cache Janus already keeps.
 */
async function incompleteIndex(
  summaries: Pick<MediaSummary, "providerId" | "kind">[],
  inLibrary: Set<string>,
  tracked: Set<string>,
): Promise<Set<string>> {
  const shelved = [
    ...new Set(
      summaries
        .filter(
          (summary) =>
            summary.kind === "tv" &&
            inLibrary.has(`show:${summary.providerId}`),
        )
        .map((summary) => summary.providerId),
    ),
  ];
  if (shelved.length === 0) return tracked;

  const counted = await Promise.all(
    shelved.map(async (providerId) =>
      isSeriesIncomplete(await seasonStates(providerId)) ? providerId : null,
    ),
  );

  const incomplete = new Set(tracked);
  for (const providerId of counted)
    if (providerId) incomplete.add(`tv:${providerId}`);
  return incomplete;
}

/**
 * One season of a series, and how much of it is here.
 *
 * The provider says what the season is made of and the index says what the
 * server holds; the difference between the two is the only thing a member
 * really wants to know, so both numbers travel together.
 */
export type SeasonState = {
  seasonNumber: number;
  /** Episodes the provider lists for that season. */
  episodeCount: number;
  airDate: string | null;
  /** Episodes of that season present on the server. */
  onServer: number;
};

/** One episode of a season, and whether the server holds it. */
export type EpisodeState = {
  episodeNumber: number;
  title: string | null;
  airDate: string | null;
  onServer: boolean;
};

/**
 * The seasons of a series, said by the provider and by the server at once.
 *
 * The one answer to "is it all there", used by the page that shows the ladder
 * and by the search that must not promise more than the page will confirm.
 * Cached per request, so a title page costs one call rather than two.
 *
 * Language is left out on purpose: only counts and dates are read here, they
 * are the same in every language, and one cache key serves every visitor.
 *
 * A provider that cannot be reached leaves the list empty, which reads as
 * unknown rather than as a shortfall.
 */
export const seasonStates = cache(async function seasonStates(
  providerId: string,
): Promise<SeasonState[]> {
  try {
    const [details, held] = await Promise.all([
      tmdbProvider.seriesDetails(providerId),
      episodeCountsBySeason(providerId),
    ]);
    return (
      details.seasons
        // Specials are numbered zero and are not what anyone means by a season.
        .filter((season) => season.seasonNumber > 0)
        .map((season) => ({
          seasonNumber: season.seasonNumber,
          episodeCount: season.episodeCount,
          airDate: season.airDate,
          onServer: held.get(season.seasonNumber) ?? 0,
        }))
    );
  } catch (error) {
    console.warn("[catalog] season list unavailable", error);
    return [];
  }
});

/** A backdrop, for the one place a title gets a whole screen to itself. */
export type TitleDetail = CatalogResult & {
  backdropUrl: string | null;
  /** Seasons the provider knows about, for a series. */
  seasons: SeasonState[];
};

/**
 * Everything one title's own page shows.
 *
 * The three states still decide what can be done with it, so this is `decorate`
 * over a single result rather than a second way of answering the same question.
 */
export const titleDetail = cache(async function titleDetail(
  kind: MediaKind,
  providerId: string,
  language?: string,
): Promise<TitleDetail> {
  const summary = await tmdbProvider.details(kind, providerId, language);
  const [decorated] = await decorate([summary]);

  const seasons = kind === "tv" ? await seasonStates(providerId) : [];

  /*
   * No second opinion here: the state was decided from these very seasons, so
   * the wording, the season badges and the update ask cannot disagree.
   */
  return {
    ...decorated,
    backdropUrl: summary.backdropPath
      ? `https://image.tmdb.org/t/p/w780${summary.backdropPath}`
      : null,
    seasons,
  };
});

/**
 * The episodes of one season, said twice over.
 *
 * The provider owns the numbering and the titles, the index owns presence, and
 * an episode is drawn from whichever of the two knows about it. If the provider
 * cannot be reached the season still lists what the server holds: a member
 * asking "is episode nine here" gets an answer either way.
 */
export async function seasonEpisodes(
  providerId: string,
  seasonNumber: number,
  language?: string,
): Promise<EpisodeState[]> {
  const [listed, held] = await Promise.all([
    tmdbProvider
      .seasonEpisodes(providerId, seasonNumber, language)
      .catch((error) => {
        console.warn("[catalog] episode list unavailable", error);
        return [];
      }),
    episodesOnServer(providerId, seasonNumber),
  ]);

  const present = new Map(held.map((row) => [row.episodeNumber, row.title]));
  const episodes = new Map<number, EpisodeState>();

  for (const episode of listed)
    episodes.set(episode.episodeNumber, {
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      airDate: episode.airDate,
      onServer: present.has(episode.episodeNumber),
    });

  // An episode the server holds and the provider does not list is still on the
  // server, and saying otherwise would contradict the card above it.
  for (const [episodeNumber, title] of present)
    if (!episodes.has(episodeNumber))
      episodes.set(episodeNumber, {
        episodeNumber,
        title,
        airDate: null,
        onServer: true,
      });

  return [...episodes.values()].sort(
    (a, b) => a.episodeNumber - b.episodeNumber,
  );
}

export function yearOf(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/**
 * Records (or refreshes) a title on the Umbra side and returns its id. Not a
 * provider cache: only requested or tracked titles ever land here.
 */
export async function ensureMedia(summary: MediaSummary): Promise<string> {
  const values = {
    provider: summary.provider,
    providerId: summary.providerId,
    mediaType: summary.kind as MediaType,
    title: summary.title,
    originalTitle: summary.originalTitle,
    overview: summary.overview,
    releaseDate: summary.releaseDate,
    posterPath: summary.posterPath,
  };

  const [row] = await db()
    .insert(media)
    .values(values)
    .onConflictDoUpdate({
      target: [media.provider, media.mediaType, media.providerId],
      set: {
        title: values.title,
        originalTitle: values.originalTitle,
        overview: values.overview,
        releaseDate: values.releaseDate,
        posterPath: values.posterPath,
        updatedAt: new Date(),
      },
    })
    .returning({ id: media.id });

  return row.id;
}
