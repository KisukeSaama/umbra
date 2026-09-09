import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  libraryItems,
  media,
  mediaRequests,
  type MediaType,
} from "@/lib/db/schema";
import { episodeCountsBySeason, episodesOnServer } from "@/lib/domain/library";
import type { MediaKind, MediaSummary } from "@/lib/providers/metadata";
import { posterUrl, tmdbProvider } from "@/lib/providers/tmdb";

/**
 * Search: the heart of Umbra.
 *
 * A result is always in exactly one of three states, and that state decides
 * both the wording and whether the request button exists at all.
 */
export type Availability = "available" | "requested" | "absent";

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
  const [inLibrary, requested] = await Promise.all([
    libraryIndex(providerIds),
    requestedIndex(providerIds),
  ]);

  return summaries.map((summary) => ({
    providerId: summary.providerId,
    kind: summary.kind,
    title: summary.title,
    originalTitle: summary.originalTitle,
    overview: summary.overview,
    year: yearOf(summary.releaseDate),
    posterUrl: posterUrl(summary.posterPath),
    availability: availabilityOf(summary, inLibrary, requested),
  }));
}

/** State of one specific title, without going through a search. */
export async function availabilityFor(
  kind: MediaKind,
  providerId: string,
): Promise<Availability> {
  const [inLibrary, requested] = await Promise.all([
    libraryIndex([providerId]),
    requestedIndex([providerId]),
  ]);
  return availabilityOf({ providerId, kind }, inLibrary, requested);
}

function availabilityOf(
  summary: Pick<MediaSummary, "providerId" | "kind">,
  inLibrary: Set<string>,
  requested: Set<string>,
): Availability {
  if (inLibrary.has(`${libraryKindOf(summary.kind)}:${summary.providerId}`))
    return "available";
  if (requested.has(`${summary.kind}:${summary.providerId}`))
    return "requested";
  return "absent";
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

  let seasons: SeasonState[] = [];
  if (kind === "tv") {
    try {
      const [details, held] = await Promise.all([
        tmdbProvider.seriesDetails(providerId, language),
        episodeCountsBySeason(providerId),
      ]);
      seasons = details.seasons
        // Specials are numbered zero and are not what anyone means by a season.
        .filter((season) => season.seasonNumber > 0)
        .map((season) => ({
          seasonNumber: season.seasonNumber,
          episodeCount: season.episodeCount,
          airDate: season.airDate,
          onServer: held.get(season.seasonNumber) ?? 0,
        }));
    } catch (error) {
      console.warn("[catalog] season list unavailable", error);
    }
  }

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
