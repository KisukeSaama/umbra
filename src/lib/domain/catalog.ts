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
import { alternateCutOf, type AlternateCut } from "@/lib/domain/cuts";
import {
  alternateCutFor,
  episodeCountsBySeason,
  episodesOnServer,
  matchesAnyProviderId,
  matchesProviderId,
  REAL_MATCH_FIRST,
} from "@/lib/domain/library";
import { isSeriesIncomplete } from "@/lib/domain/seasons";
import { settledIndex } from "@/lib/domain/settled";
import type { Genre, MediaKind, MediaSummary } from "@/lib/providers/metadata";
import { plexDetailsUrl, plexLibrary } from "@/lib/providers/plex";
import { posterUrl, tmdbLanguage, tmdbProvider } from "@/lib/providers/tmdb";

/** Search: the heart of Umbra. The states themselves live one file away. */
export type { Availability };

export type CatalogResult = {
  voteAverage?: number | null;
  voteCount?: number;
  providerId: string;
  kind: MediaKind;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  year: number | null;
  posterUrl: string | null;
  availability: Availability;
  /**
   * The re-cut the server holds this series in, when it is not the series
   * itself. Nothing to ask for and no ladder to draw: see `@/lib/domain/cuts`.
   */
  alternateCut: AlternateCut | null;
};

/** Library kind matching a media kind. */
function libraryKindOf(kind: MediaKind) {
  return kind === "movie" ? "movie" : "show";
}

/** `movie:335984` / `tv:209867`: a movie and a series can carry the same id. */
function keyOf(summary: Pick<MediaSummary, "providerId" | "kind">) {
  return `${summary.kind}:${summary.providerId}`;
}

/** The same title as the server files it. */
function libraryKeyOf(summary: Pick<MediaSummary, "providerId" | "kind">) {
  return `${libraryKindOf(summary.kind)}:${summary.providerId}`;
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
  const cuts = cutIndex(summaries, inLibrary);
  const incomplete = await incompleteIndex(summaries, inLibrary, tracked, cuts);

  return summaries.map((summary) => ({
    voteAverage: summary.voteAverage,
    voteCount: summary.voteCount,
    providerId: summary.providerId,
    kind: summary.kind,
    title: summary.title,
    originalTitle: summary.originalTitle,
    overview: summary.overview,
    year: yearOf(summary.releaseDate),
    posterUrl: posterUrl(summary.posterPath),
    availability: stateOf(summary, inLibrary, requested, incomplete, settled),
    alternateCut: cuts.get(keyOf(summary)) ?? null,
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
  /*
   * The write guards come through here, and they have no provider summary to
   * compare a re-cut marker against, so the library layer fetches one. It only
   * does so for the handful of titles the server files under such a name, and
   * Janus answers that call from its cache. Skipping it would let the page call
   * a series whole while this refused the ask its ladder no longer offers.
   */
  const cut = await alternateCutFor(
    kind,
    providerId,
    inLibrary.get(libraryKeyOf(summary)) ?? null,
  );
  const cuts = new Map<string, AlternateCut>(
    cut ? [[keyOf(summary), cut]] : [],
  );
  const incomplete = await incompleteIndex([summary], inLibrary, tracked, cuts);
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
  inLibrary: Map<string, string>,
  requested: Set<string>,
  incomplete: Set<string>,
  settled: Set<string>,
): Availability {
  const key = keyOf(summary);
  return availabilityOf({
    inLibrary: inLibrary.has(libraryKeyOf(summary)),
    incomplete: incomplete.has(key) && !settled.has(key),
    requested: requested.has(key),
  });
}

/**
 * The re-cut each result is held in, when it is one.
 *
 * Read from the name the server files the show under, against the names the
 * provider gives it. No query and no call: both sides are already in hand.
 */
function cutIndex(
  summaries: Pick<
    MediaSummary,
    "providerId" | "kind" | "title" | "originalTitle"
  >[],
  inLibrary: Map<string, string>,
): Map<string, AlternateCut> {
  const cuts = new Map<string, AlternateCut>();
  for (const summary of summaries) {
    if (summary.kind !== "tv") continue;
    const cut = alternateCutOf(inLibrary.get(libraryKeyOf(summary)), [
      summary.title,
      summary.originalTitle,
    ]);
    if (cut) cuts.set(keyOf(summary), cut);
  }
  return cuts;
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

/**
 * Keys `movie:335984` / `show:209867` present on the server, and the name the
 * server files each of them under.
 *
 * The name rides along because presence is not always the whole answer: a show
 * the server holds under a re-cut name is here whole while its numbering will
 * never match the provider. One column more on a query that was happening
 * anyway.
 */
async function libraryIndex(
  providerIds: string[],
): Promise<Map<string, string>> {
  const rows = await db()
    .select({
      tmdbId: libraryItems.tmdbId,
      cutProviderId: libraryItems.cutProviderId,
      kind: libraryItems.kind,
      title: libraryItems.title,
    })
    .from(libraryItems)
    .where(
      and(
        // A re-cut the media server matched to nothing carries the id Umbra
        // worked out from its name instead. Without this the title is here and
        // the search still offers to request it: see `linkUnmatchedCuts`.
        matchesAnyProviderId(providerIds),
        inArray(libraryItems.kind, ["movie", "show"] as const),
      ),
    )
    .orderBy(REAL_MATCH_FIRST);

  const index = new Map<string, string>();
  for (const row of rows) {
    const providerId = row.tmdbId ?? row.cutProviderId;
    if (!providerId) continue;
    const key = `${row.kind}:${providerId}`;
    if (!index.has(key)) index.set(key, row.title);
  }
  return index;
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
  inLibrary: Map<string, string>,
  tracked: Set<string>,
  cuts: Map<string, AlternateCut> = new Map(),
): Promise<Set<string>> {
  /*
   * A re-cut is never short. It drops episodes on purpose and renumbers what
   * is left, so counting it against the provider calendar invents a shortfall
   * that nothing can ever fill: the tracker would keep the series partial
   * forever and the page would keep offering to ask for episodes that were
   * removed deliberately.
   */
  const whole = summaries.filter((summary) => !cuts.has(keyOf(summary)));
  const shelved = [
    ...new Set(
      whole
        .filter(
          (summary) =>
            summary.kind === "tv" &&
            inLibrary.has(`show:${summary.providerId}`),
        )
        .map((summary) => summary.providerId),
    ),
  ];
  if (shelved.length === 0) return withoutCuts(tracked, cuts);

  const counted = await Promise.all(
    shelved.map(async (providerId) =>
      isSeriesIncomplete(await seasonStates(providerId)) ? providerId : null,
    ),
  );

  const incomplete = withoutCuts(tracked, cuts);
  for (const providerId of counted)
    if (providerId) incomplete.add(`tv:${providerId}`);
  return incomplete;
}

/** The tracker calendar has the same blind spot, so it is filtered the same. */
function withoutCuts(
  tracked: Set<string>,
  cuts: Map<string, AlternateCut>,
): Set<string> {
  return new Set([...tracked].filter((key) => !cuts.has(key)));
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
  /** In the visitor's language, as the provider names them. */
  genres: Genre[];
  /** The provider score out of ten and the votes behind it: see `MediaSummary`. */
  voteAverage: number | null;
  voteCount: number;
  /**
   * Seasons the provider knows about, for a series. Empty for a re-cut: its
   * numbering is its own, so a ladder built on the provider calendar would
   * mark every season short and offer to ask for what was cut on purpose.
   */
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

  const seasons =
    kind === "tv" && !decorated.alternateCut
      ? await seasonStates(providerId)
      : [];

  /*
   * No second opinion here: the state was decided from these very seasons, so
   * the wording, the season badges and the update ask cannot disagree.
   */
  return {
    ...decorated,
    backdropUrl: summary.backdropPath
      ? `https://image.tmdb.org/t/p/w780${summary.backdropPath}`
      : null,
    genres: summary.genres ?? [],
    voteAverage: summary.voteAverage,
    voteCount: summary.voteCount,
    seasons,
  };
});

/** Direct Plex destination for a title the local index currently holds. */
export async function titlePlexUrl(
  kind: MediaKind,
  providerId: string,
): Promise<string | null> {
  const [row] = await db()
    .select({ ratingKey: libraryItems.ratingKey })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, kind === "movie" ? "movie" : "show"),
        matchesProviderId(providerId),
      ),
    )
    .orderBy(REAL_MATCH_FIRST)
    .limit(1);
  if (!row) return null;

  try {
    return plexDetailsUrl(await plexLibrary.machineIdentifier(), row.ratingKey);
  } catch (error) {
    console.warn("[catalog] Plex link unavailable", error);
    return null;
  }
}

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
 *
 * `language` is the language the summary was fetched in, when it was fetched
 * for somebody in particular. The row is written in one language whatever
 * language it was asked in: it is what the administration reads in its queues
 * and what every notification carries, so a French member's request used to
 * rename the title for everyone, and the next English report renamed it back.
 * The canonical summary is asked for instead, which Janus answers from its
 * cache, and the wording the member sees is the one their own call returned.
 */
export async function ensureMedia(
  summary: MediaSummary,
  language?: string,
): Promise<string> {
  const localised =
    language !== undefined && tmdbLanguage(language) !== tmdbLanguage();
  const canonical = localised
    ? await tmdbProvider.details(summary.kind, summary.providerId)
    : summary;

  const values = {
    provider: canonical.provider,
    providerId: canonical.providerId,
    mediaType: canonical.kind as MediaType,
    title: canonical.title,
    originalTitle: canonical.originalTitle,
    overview: canonical.overview,
    releaseDate: canonical.releaseDate,
    posterPath: canonical.posterPath,
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
