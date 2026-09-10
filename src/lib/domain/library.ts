import "server-only";

import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db";
import { libraryItems, type LibraryKind } from "@/lib/db/schema";
import {
  alternateCutOf,
  beginsWithTitle,
  hasCutMarker,
  sameTitle,
  titleWithoutCut,
  type AlternateCut,
} from "@/lib/domain/cuts";
import type { LibraryItem } from "@/lib/providers/library";
import { plexLibrary } from "@/lib/providers/plex";
import { posterUrl, RATING_FLOOR, tmdbProvider } from "@/lib/providers/tmdb";

/**
 * Local view of the server library.
 *
 * Umbra does not mirror the whole server experience: it keeps just enough of an
 * index to answer "is it already there", to show what arrived recently, and to
 * pick something at random.
 */

/** A title on the server, reduced to what a report or a card needs. */
export type LibraryMatch = {
  ratingKey: string;
  kind: "movie" | "tv";
  providerId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  /**
   * The re-cut the server holds it in, when it is one. It travels with the
   * match because it decides what may be said about the title: see
   * `@/lib/reports/reasons`.
   */
  alternateCut: AlternateCut | null;
};

export type RecentItem = {
  voteAverage?: number | null;
  voteCount?: number;
  ratingKey: string;
  /** Provider id when the media server matched the title, so a card can link. */
  providerId: string | null;
  kind: "movie" | "show" | "episode";
  title: string;
  showTitle: string | null;
  year: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  posterUrl: string | null;
  addedAt: Date | null;
};

/**
 * Full library sync.
 *
 * Idempotent by design: everything is upserted on `rating_key`, then entries
 * not seen during this pass are dropped. Running it twice changes nothing,
 * running it after downtime catches everything up.
 */
export async function syncLibrary(): Promise<{
  items: number;
  episodes: number;
}> {
  const startedAt = new Date();
  const sections = await plexLibrary.sections();

  let items = 0;
  let episodeCount = 0;

  for (const section of sections) {
    const sectionItems = await plexLibrary.sectionItems(section.key);
    items += await upsertItems(sectionItems);

    let sectionEpisodes: LibraryItem[] = [];
    if (section.kind === "show") {
      sectionEpisodes = await plexLibrary.sectionEpisodes(section.key);
      episodeCount += await upsertItems(sectionEpisodes);
    }

    /*
     * What the server no longer holds must not keep answering "available", but
     * the sweep is scoped to the section that just answered, and only when it
     * answered with something. A section whose storage is not mounted, or one
     * read while the server is restarting, comes back empty without failing: a
     * sweep over the whole table would then erase it, and with it every request
     * and every report attached to those titles.
     *
     * The two listings are swept apart because they are two answers. A show
     * section names its shows in one call and its episodes in another, and an
     * empty answer to the second one, which is what a server mid-scan gives,
     * would otherwise take every episode of a section whose shows had just
     * confirmed themselves.
     */
    if (sectionItems.length > 0)
      await sweepSection(section.key, startedAt, ["movie", "show", "season"]);
    if (sectionEpisodes.length > 0)
      await sweepSection(section.key, startedAt, ["episode"]);
  }

  return { items, episodes: episodeCount };
}

/** Entries of these kinds that this pass did not see again, in one section. */
async function sweepSection(
  sectionKey: string,
  startedAt: Date,
  kinds: LibraryKind[],
) {
  await db()
    .delete(libraryItems)
    .where(
      and(
        eq(libraryItems.sectionKey, sectionKey),
        lt(libraryItems.syncedAt, startedAt),
        inArray(libraryItems.kind, kinds),
      ),
    );
}

async function upsertItems(entries: LibraryItem[]): Promise<number> {
  if (entries.length === 0) return 0;

  // Postgres caps parameters per statement, so large libraries go in chunks.
  const CHUNK = 250;
  for (let start = 0; start < entries.length; start += CHUNK) {
    const chunk = entries.slice(start, start + CHUNK);
    await db()
      .insert(libraryItems)
      .values(
        chunk.map((entry) => ({
          ratingKey: entry.ratingKey,
          kind: entry.kind,
          title: entry.title,
          year: entry.year,
          tmdbId: entry.tmdbId,
          tvdbId: entry.tvdbId,
          imdbId: entry.imdbId,
          parentRatingKey: entry.parentRatingKey,
          grandparentRatingKey: entry.grandparentRatingKey,
          grandparentTitle: entry.grandparentTitle,
          seasonNumber: entry.seasonNumber,
          episodeNumber: entry.episodeNumber,
          sectionKey: entry.sectionKey,
          addedAt: entry.addedAt,
        })),
      )
      .onConflictDoUpdate({
        target: libraryItems.ratingKey,
        set: {
          title: sql`excluded.title`,
          year: sql`excluded.year`,
          tmdbId: sql`excluded.tmdb_id`,
          tvdbId: sql`excluded.tvdb_id`,
          imdbId: sql`excluded.imdb_id`,
          parentRatingKey: sql`excluded.parent_rating_key`,
          grandparentRatingKey: sql`excluded.grandparent_rating_key`,
          grandparentTitle: sql`excluded.grandparent_title`,
          seasonNumber: sql`excluded.season_number`,
          episodeNumber: sql`excluded.episode_number`,
          sectionKey: sql`excluded.section_key`,
          addedAt: sql`excluded.added_at`,
          syncedAt: new Date(),
        },
      });
  }

  return entries.length;
}

/** Recently added, movies and shows only: an episode rail would be noise. */
export async function recentlyAdded(limit = 12): Promise<RecentItem[]> {
  const rows = await db()
    .select()
    .from(libraryItems)
    .where(inArray(libraryItems.kind, ["movie", "show"]))
    .orderBy(desc(libraryItems.addedAt))
    .limit(limit);

  return rows.map(toRecentItem);
}

/**
 * Fills in what the media server does not say: the poster, and the genres.
 *
 * Capped per run: the point is a steady trickle after each sync, not a burst of
 * calls against the provider quota. Only titles with a known provider id can be
 * resolved, and a failure simply leaves the entry for the next run.
 *
 * Genres ride along because the details call already carries them. They are
 * what the genre shelves read and what the taste profile is built from, so they
 * cost nothing beyond a call that was happening anyway. The score rides along
 * for the same reason, and it is what lets the half of the picker drawn from
 * the server hold the same bar as the half drawn from the provider.
 */
/**
 * How long a row the pass could not complete waits before it is tried again.
 *
 * A poster can appear at the provider months after the title did, so a row is
 * never given up on for good; it simply stops being asked for on every run.
 */
const ENRICH_RETRY_DAYS = 30;

export async function enrichLibraryPosters(limit = 120): Promise<number> {
  const retryBefore = new Date(
    Date.now() - ENRICH_RETRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db()
    .select({
      id: libraryItems.id,
      kind: libraryItems.kind,
      tmdbId: libraryItems.tmdbId,
      cutProviderId: libraryItems.cutProviderId,
    })
    .from(libraryItems)
    .where(
      and(
        or(
          isNull(libraryItems.posterPath),
          isNull(libraryItems.genreIds),
          isNull(libraryItems.voteAverage),
        ),
        // A re-cut wears the poster, the genres and the score of the series it
        // is a re-cut of, which is the only picture there is for it.
        or(
          isNotNull(libraryItems.tmdbId),
          isNotNull(libraryItems.cutProviderId),
        ),
        inArray(libraryItems.kind, ["movie", "show"]),
        /*
         * A row this pass has already looked at waits before it is looked at
         * again. Some titles can never be completed, because the provider has
         * no poster for them, and without this they would hold the newest
         * places in the queue forever and the rest of the index would never
         * fill in.
         */
        or(
          isNull(libraryItems.enrichedAt),
          lt(libraryItems.enrichedAt, retryBefore),
        ),
      ),
    )
    // Never looked at first, then newest: those are the ones on screen.
    .orderBy(
      sql`${libraryItems.enrichedAt} ASC NULLS FIRST`,
      desc(libraryItems.addedAt),
    )
    .limit(limit);

  const now = new Date();
  let filled = 0;
  for (const row of rows) {
    const providerId = row.tmdbId ?? row.cutProviderId;
    if (!providerId) continue;
    try {
      const summary = await tmdbProvider.details(
        row.kind === "movie" ? "movie" : "tv",
        providerId,
      );
      await db()
        .update(libraryItems)
        .set({
          enrichedAt: now,
          posterPath: summary.posterPath ?? undefined,
          // An empty list is still an answer: it stops the row coming back on
          // every run for a title the provider has no genres for.
          genreIds: summary.genreIds,
          // Same reasoning, and the reason the column is written rather than
          // left null when the provider has no score: unrated reads as zero,
          // which fails the floor, and null would fetch this row forever.
          voteAverage: summary.voteAverage ?? 0,
          voteCount: summary.voteCount,
        })
        .where(eq(libraryItems.id, row.id));
      filled += 1;
    } catch (error) {
      console.warn(`[library] lookup failed tmdbId=${providerId}`, error);
      // Stamped even so: a title the provider keeps refusing must not be asked
      // for again on every run at the cost of the rows behind it.
      await db()
        .update(libraryItems)
        .set({ enrichedAt: now })
        .where(eq(libraryItems.id, row.id));
    }
  }
  return filled;
}

/**
 * Titles on the server whose name contains what was typed.
 *
 * The only search that does not go to the provider, and the one the report flow
 * uses: you can only report something that is here, so the list to pick from is
 * the local index. Entries the media server could not match to a provider id
 * are left out, since without one there is no stable identity to attach a
 * report to.
 */
/**
 * What was typed, as a `LIKE` pattern that matches it literally.
 *
 * `%` and `_` are wildcards and the backslash is the escape character, so a
 * query of "%" would otherwise list the newest titles rather than the titles
 * with a percent sign in their name.
 */
export function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function searchLibrary(
  query: string,
  limit = 12,
): Promise<LibraryMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rows = await db()
    .select({
      ratingKey: libraryItems.ratingKey,
      kind: libraryItems.kind,
      title: libraryItems.title,
      year: libraryItems.year,
      tmdbId: libraryItems.tmdbId,
      cutProviderId: libraryItems.cutProviderId,
      posterPath: libraryItems.posterPath,
    })
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.kind, ["movie", "show"]),
        or(
          isNotNull(libraryItems.tmdbId),
          isNotNull(libraryItems.cutProviderId),
        ),
        ilike(libraryItems.title, containsPattern(trimmed)),
      ),
    )
    .orderBy(desc(libraryItems.addedAt))
    .limit(limit);

  return Promise.all(
    rows.map(async (row) => {
      const kind = row.kind === "movie" ? ("movie" as const) : ("tv" as const);
      const providerId = row.tmdbId ?? row.cutProviderId ?? "";
      return {
        ratingKey: row.ratingKey,
        kind,
        providerId,
        title: row.title,
        year: row.year,
        posterUrl: posterUrl(row.posterPath),
        alternateCut: await alternateCutFor(kind, providerId, row.title),
      };
    }),
  );
}

/**
 * Finds a title by either of the two ids it can be known by.
 *
 * The media server gives one, in `tmdb_id`, and a re-cut it matched to nothing
 * has the other, in `cut_provider_id`, worked out from its name by
 * `linkUnmatchedCuts`. Three different reads needed the same pair of
 * conditions, and they must stay the same pair: a title reachable by one of
 * them and not the other is a title that is on the server while search still
 * offers to request it.
 */
export function matchesProviderId(providerId: string) {
  return or(
    eq(libraryItems.tmdbId, providerId),
    eq(libraryItems.cutProviderId, providerId),
  );
}

/** The same question, asked of several ids at once. */
export function matchesAnyProviderId(providerIds: string[]) {
  return or(
    inArray(libraryItems.tmdbId, providerIds),
    inArray(libraryItems.cutProviderId, providerIds),
  );
}

/**
 * A server that matched the series itself answers before one Umbra had to work
 * out, so a library holding both reads as the series rather than the re-cut.
 */
export const REAL_MATCH_FIRST = sql`${libraryItems.tmdbId} NULLS LAST`;

/**
 * The re-cut a title on the server is in, or nothing.
 *
 * The name the server files it under is compared with the names the provider
 * gives it, so a series the provider itself calls "Kai" keeps its own identity.
 * Passing the server title in avoids a query for callers that already hold it;
 * the provider call behind the comparison only happens for the handful of
 * titles whose name carries a marker, and Janus answers it from its cache.
 *
 * A film is never a re-cut, so it is answered without asking anyone.
 */
export async function alternateCutFor(
  kind: "movie" | "tv",
  providerId: string,
  libraryTitle?: string | null,
): Promise<AlternateCut | null> {
  if (kind === "movie" || !providerId) return null;

  const title =
    libraryTitle === undefined
      ? await libraryTitleOf(providerId)
      : libraryTitle;
  if (!hasCutMarker(title)) return null;

  try {
    const summary = await tmdbProvider.details("tv", providerId);
    return alternateCutOf(title, [summary.title, summary.originalTitle]);
  } catch (error) {
    // Unknown reads as a re-cut, which is the safe way round: it states the
    // cut rather than inventing a shortfall out of a numbering of its own.
    console.warn("[library] cut check unavailable", error);
    return alternateCutOf(title);
  }
}

async function libraryTitleOf(providerId: string): Promise<string | null> {
  const [row] = await db()
    .select({ title: libraryItems.title })
    .from(libraryItems)
    .where(and(eq(libraryItems.kind, "show"), matchesProviderId(providerId)))
    .orderBy(REAL_MATCH_FIRST)
    .limit(1);
  return row?.title ?? null;
}

/**
 * Links re-cuts the media server matched to nothing.
 *
 * A re-cut filed as personal media carries no guid at all: no TMDB id, no TVDB
 * id, nothing. The sync therefore files it with an empty `tmdb_id` and every
 * rule about presence walks straight past it, which is why a server holding
 * "Naruto Kai" still offered to request Naruto.
 *
 * The name is the only thing left to go on, and for these it is enough: they
 * are filed as the original name with the marker stuck on the end. So the
 * marker comes off and the rest is looked up, under two rules that both refuse
 * rather than guess. The name must match a series exactly, accents and
 * punctuation aside; failing that, it must be the beginning of exactly one
 * series the provider knows, which is what links "Boruto" to "Boruto: Naruto
 * Next Generations" without linking "Dragon Ball" to any of the four series
 * whose name starts that way.
 *
 * The year is never a reason to refuse. The server files a re-cut under the
 * year the re-cut was made, not the year the series first aired, so it only
 * ever separates two candidates that matched equally well.
 *
 * What it finds goes in a column of its own, so the next sync does not wipe it
 * and the tracker does not pick these series up: a re-cut has no calendar to
 * be late on. A name it cannot resolve is stamped as looked at and left alone
 * until the next run, so a library of unmatched titles does not cost a search
 * per pass forever.
 */
export async function linkUnmatchedCuts(limit = 20): Promise<number> {
  const rows = await db()
    .select({
      id: libraryItems.id,
      title: libraryItems.title,
      year: libraryItems.year,
    })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, "show"),
        isNull(libraryItems.tmdbId),
        isNull(libraryItems.cutProviderId),
        or(
          isNull(libraryItems.cutCheckedAt),
          lt(libraryItems.cutCheckedAt, sql`now() - INTERVAL '7 days'`),
        ),
      ),
    )
    .orderBy(sql`${libraryItems.cutCheckedAt} NULLS FIRST`)
    .limit(limit);

  let linked = 0;
  for (const row of rows) {
    const base = titleWithoutCut(row.title);
    // Not a re-cut, just a title the server could not match. Stamped all the
    // same, so it is not looked at again on every run.
    const providerId = base ? await lookUpSeries(base, row.year) : null;

    await db()
      .update(libraryItems)
      .set({ cutProviderId: providerId, cutCheckedAt: new Date() })
      .where(eq(libraryItems.id, row.id));
    if (providerId) linked += 1;
  }
  return linked;
}

/** The one series that answers to this name, or nothing. */
async function lookUpSeries(
  base: string,
  year: number | null,
): Promise<string | null> {
  let results;
  try {
    results = await tmdbProvider.search(base);
  } catch (error) {
    console.warn(`[library] cut lookup failed for ${base}`, error);
    return null;
  }

  const series = results.filter((result) => result.kind === "tv");
  const exact = series.filter(
    (result) =>
      sameTitle(result.title, base) || sameTitle(result.originalTitle, base),
  );
  const chosen =
    pickOne(exact, year) ??
    pickOne(
      series.filter(
        (result) =>
          beginsWithTitle(result.title, base) ||
          beginsWithTitle(result.originalTitle, base),
      ),
      year,
    );

  return chosen?.providerId ?? null;
}

/**
 * One candidate, or none.
 *
 * Several names matching equally well is not a match, so the year is asked
 * before giving up; it decides only when it singles one out.
 */
function pickOne<T extends { releaseDate: string | null }>(
  candidates: T[],
  year: number | null,
): T | null {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0 || year === null) return null;

  const dated = candidates.filter(
    (candidate) => candidate.releaseDate?.slice(0, 4) === String(year),
  );
  return dated.length === 1 ? dated[0] : null;
}

/**
 * The seasons of a show as the server actually holds them.
 *
 * A report about something being wrong points at what exists, so the choice
 * comes from the index. A report about something missing is the other way
 * round and reads the broadcast calendar instead.
 */
export async function seasonsOnServer(providerId: string): Promise<number[]> {
  const rows = await db().execute<{ season_number: number }>(sql`
    SELECT DISTINCT ep.season_number
      FROM library_item AS ep
      JOIN library_item AS show
        ON show.rating_key = ep.grandparent_rating_key
     WHERE ep.kind = 'episode'
       AND show.tmdb_id = ${providerId}::text
       AND ep.season_number IS NOT NULL
     ORDER BY ep.season_number
  `);
  return rows.map((row) => row.season_number);
}

/**
 * How many episodes of each season the server holds.
 *
 * One statement rather than one query per season: a title page draws the whole
 * ladder at once, and a show with twenty seasons would otherwise cost twenty
 * round trips to say the same thing.
 */
export async function episodeCountsBySeason(
  providerId: string,
): Promise<Map<number, number>> {
  const rows = await db().execute<{ season_number: number; held: number }>(sql`
    SELECT ep.season_number, COUNT(DISTINCT ep.episode_number)::int AS held
      FROM library_item AS ep
      JOIN library_item AS show
        ON show.rating_key = ep.grandparent_rating_key
     WHERE ep.kind = 'episode'
       AND show.tmdb_id = ${providerId}::text
       AND ep.season_number IS NOT NULL
       AND ep.episode_number IS NOT NULL
     GROUP BY ep.season_number
  `);
  return new Map(rows.map((row) => [row.season_number, Number(row.held)]));
}

/** The episodes of one season, as the server holds them. */
export async function episodesOnServer(
  providerId: string,
  seasonNumber: number,
): Promise<{ episodeNumber: number; title: string }[]> {
  const rows = await db().execute<{
    episode_number: number;
    title: string;
  }>(sql`
    SELECT ep.episode_number, ep.title
      FROM library_item AS ep
      JOIN library_item AS show
        ON show.rating_key = ep.grandparent_rating_key
     WHERE ep.kind = 'episode'
       AND show.tmdb_id = ${providerId}::text
       AND ep.season_number = ${seasonNumber}::int
       AND ep.episode_number IS NOT NULL
     ORDER BY ep.episode_number
  `);
  return rows.map((row) => ({
    episodeNumber: row.episode_number,
    title: row.title,
  }));
}

/**
 * A genuine Postgres array, written out rather than passed as one.
 *
 * A JavaScript array dropped into a template is expanded into a parenthesised
 * list of parameters, which Postgres reads as a record: `&& ($1, $2)::int[]`
 * fails at the cast, and the whole request comes back a 500. Spelling out
 * `ARRAY[...]` keeps the values parameterised and the type right.
 */
export function intArray(values: number[]) {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::int[]`;
}

/**
 * How many votes a score has to stand on before it is read as one.
 *
 * Far below the floor the provider applies, and deliberately: the shelf here is
 * one server's library rather than every title ever released, so the number is
 * only there to throw out a score nobody agreed on yet.
 */
const MEANINGFUL_VOTES = 50;

/**
 * Random picks on the server that match at least one of these genres.
 *
 * The overlap operator reads the array the enrichment pass filled in, so the
 * guided picker can answer half its selection from what is already here. That
 * half is the point: an idea you can act on tonight beats one you have to wait
 * for.
 */
export async function randomAvailableByGenres(
  kind: "movie" | "tv",
  genreIds: number[],
  limit: number,
  excludeGenreIds: number[] = [],
  requireGenreIds: number[] = [],
): Promise<RecentItem[]> {
  const rows = await db()
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, kind === "movie" ? "movie" : "show"),
        isNotNull(libraryItems.posterPath),
        ...(genreIds.length
          ? [sql`${libraryItems.genreIds} && ${intArray(genreIds)}`]
          : []),
        // The same union problem as on the provider side: a title kept only
        // because it carries Comedy somewhere is not an answer to "make me
        // laugh" when its other genre is Horror.
        ...(excludeGenreIds.length
          ? [
              sql`NOT (${libraryItems.genreIds} && ${intArray(excludeGenreIds)})`,
            ]
          : []),
        // Contains, not overlaps: these are the genres a title has to carry on
        // top of the mood, which is how "a romance, and drawn" stays two
        // conditions rather than widening into either of them. The index holds
        // no original language, so on this side "only anime" reads as
        // Animation alone: the shelf is what the server has, and it is small
        // enough that the difference is not what empties it.
        ...(requireGenreIds.length
          ? [sql`${libraryItems.genreIds} @> ${intArray(requireGenreIds)}`]
          : []),
        // The same bar the provider half is held to, on the one score the index
        // has. Null is not a failing grade: the enrichment pass fills the index
        // over several runs, and reading null as "bad" would leave the picker
        // with an empty evening until it caught up. A row that has been stamped
        // has to earn its place, and it earns it on both numbers at once, since
        // a nine standing on a handful of votes is not a recommendation.
        sql`(
          ${libraryItems.voteAverage} IS NULL
          OR (
            ${libraryItems.voteAverage} >= ${RATING_FLOOR}
            AND coalesce(${libraryItems.voteCount}, 0) >= ${MEANINGFUL_VOTES}
          )
        )`,
      ),
    )
    .orderBy(sql`random()`)
    .limit(limit);
  return rows.map(toRecentItem);
}

/**
 * The titles among these the server holds, in the order the ids were given.
 *
 * The picker hands over a ranking and wants back the part of it that can be
 * played tonight, still ranked. One card per title, whatever cuts the server
 * keeps of it.
 */
export async function availableByProviderIds(
  kind: "movie" | "tv",
  providerIds: string[],
): Promise<RecentItem[]> {
  if (providerIds.length === 0) return [];
  const rows = await db()
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, kind === "movie" ? "movie" : "show"),
        isNotNull(libraryItems.posterPath),
        inArray(libraryItems.tmdbId, providerIds),
      ),
    );

  const rank = new Map(providerIds.map((id, index) => [id, index]));
  const seen = new Set<string>();
  return rows
    .sort(
      (a, b) =>
        (rank.get(a.tmdbId ?? "") ?? 0) - (rank.get(b.tmdbId ?? "") ?? 0),
    )
    .filter((row) => {
      if (!row.tmdbId || seen.has(row.tmdbId)) return false;
      seen.add(row.tmdbId);
      return true;
    })
    .map(toRecentItem);
}

function toRecentItem(row: typeof libraryItems.$inferSelect): RecentItem {
  return {
    voteAverage: row.voteAverage,
    voteCount: row.voteCount ?? 0,
    ratingKey: row.ratingKey,
    providerId: row.tmdbId,
    kind: row.kind === "season" ? "show" : row.kind,
    title: row.title,
    showTitle: row.grandparentTitle,
    year: row.year,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    // Posters come from TMDB, not from the media server: no token leaves the
    // backend and the browser only ever talks to a public CDN.
    posterUrl: posterUrl(row.posterPath),
    addedAt: row.addedAt,
  };
}
