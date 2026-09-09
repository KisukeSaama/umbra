import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  libraryItems,
  media,
  mediaRequests,
  type MediaType,
} from "@/lib/db/schema";
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
