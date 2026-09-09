/**
 * Media library contract (the Plex server behind Kisuflix).
 *
 * Domain code never talks to the server directly: no token, no internal
 * address and no file path ever leaves this layer.
 */

export type LibraryKind = "movie" | "show" | "season" | "episode";

export type LibrarySection = {
  key: string;
  title: string;
  kind: LibraryKind;
};

/** A library entry, reduced to what Umbra actually uses. */
export type LibraryItem = {
  ratingKey: string;
  kind: LibraryKind;
  title: string;
  year: number | null;
  tmdbId: string | null;
  tvdbId: string | null;
  imdbId: string | null;
  parentRatingKey: string | null;
  grandparentRatingKey: string | null;
  /** Show title, for an episode. */
  grandparentTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  addedAt: Date | null;
  sectionKey: string | null;
};

/**
 * One thing a person watched, reduced to what a taste profile needs.
 *
 * Deliberately not a title and not a date beyond the timestamp used to bound
 * the window: nothing here is stored, it is aggregated into genre weights and
 * dropped. See `docs/adr/0007-aggregated-taste-profile.md`.
 */
export type WatchEvent = {
  ratingKey: string;
  /** The show, when the entry is an episode. */
  grandparentRatingKey: string | null;
  kind: LibraryKind;
};

export interface MediaLibraryProvider {
  readonly name: string;
  sections(): Promise<LibrarySection[]>;
  /** Movies or shows of a section (not episodes). */
  sectionItems(sectionKey: string): Promise<LibraryItem[]>;
  /** Every episode of a show section. */
  sectionEpisodes(sectionKey: string): Promise<LibraryItem[]>;
  recentlyAdded(limit: number): Promise<LibraryItem[]>;
  /** What one account watched since a date, keys only. */
  watchHistory(options: {
    plexAccountId: string;
    since: Date;
    limit: number;
  }): Promise<WatchEvent[]>;
}

export function parseLibraryKind(
  raw: string | null | undefined,
): LibraryKind | null {
  return raw === "movie" ||
    raw === "show" ||
    raw === "season" ||
    raw === "episode"
    ? raw
    : null;
}
