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

export interface MediaLibraryProvider {
  readonly name: string;
  sections(): Promise<LibrarySection[]>;
  /** Movies or shows of a section (not episodes). */
  sectionItems(sectionKey: string): Promise<LibraryItem[]>;
  /** Every episode of a show section. */
  sectionEpisodes(sectionKey: string): Promise<LibraryItem[]>;
  recentlyAdded(limit: number): Promise<LibraryItem[]>;
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
