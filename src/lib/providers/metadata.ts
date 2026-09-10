/**
 * Metadata provider contract.
 *
 * Domain code only knows this interface: TMDB is the first implementation, and
 * another source (TVDB) can be added later without touching callers.
 */

export type MediaKind = "movie" | "tv";

/** What a result card needs to display. */
export type MediaSummary = {
  provider: string;
  providerId: string;
  kind: MediaKind;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  /** `YYYY-MM-DD` */
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  /** Only used to rank search results. */
  popularity: number;
  /** Minutes, available on movie details only. */
  runtime?: number | null;
  /**
   * Provider genre ids. Present on list rows and on details, which is what
   * lets the library index be stamped without a second call.
   */
  genreIds: number[];
  /**
   * ISO 639-1 of the original version, when the row carries it. What lets a
   * row be checked against "only anime" without asking again: the genre alone
   * answers with Pixar.
   */
  originalLanguage?: string | null;
  /**
   * Average score out of ten, and how many votes stand behind it. The two are
   * one fact: a nine held up by four votes says nothing. Null is "not known",
   * which is not the same as zero, and the library index leans on that
   * difference while it fills in.
   */
  voteAverage: number | null;
  voteCount: number;
  /**
   * Genres by name, in the visitor's language. Only a details payload carries
   * them, so a listing row leaves this out and keeps `genreIds` alone.
   */
  genres?: Genre[];
};

export type Genre = { id: number; name: string };

/** Someone who worked on a title, as much as a card needs. */
export type PersonRef = {
  personId: string;
  name: string;
  profilePath: string | null;
};

/**
 * One line of a cast list. A voice role is still a role, but it is not the
 * same work, and a member looking for who voiced a character reads it apart.
 */
export type CastCredit = PersonRef & {
  character: string | null;
  voice: boolean;
};

export type TitleCredits = {
  /**
   * Whoever signs the title: the directors of a film, the creators of a show.
   * Empty when the provider names nobody, which is common for a show.
   */
  leads: PersonRef[];
  /** Billing order, as the provider gives it. */
  cast: CastCredit[];
};

export type PersonRole = "director" | "creator" | "writer" | "cast" | "voice";

export type PersonCredit = { summary: MediaSummary; role: PersonRole };

/**
 * A person and the titles they worked on. Nothing about them is kept: it is
 * read from the provider for the page that shows it, like a title is.
 */
export type PersonDetails = PersonRef & {
  /** The provider department they are best known in (`Acting`, `Directing`...). */
  knownFor: string | null;
  credits: PersonCredit[];
};

/** How a shelf or the guided picker asks for titles it cannot name. */
export type DiscoverQuery = {
  kind: MediaKind;
  /** Any one of these is enough. Absent means every genre. */
  genreIds?: number[];
  /**
   * Any one of these disqualifies a title. Genres are a union, so without a
   * way to say no a mood widens until it means nothing: a film filed under
   * both Comedy and War answers "make me laugh" on the strength of the first.
   */
  excludeGenreIds?: number[];
  /**
   * Every one of these must be carried by a title, on top of the union above.
   * "A romance, and drawn" is two questions and they do not combine into one
   * list: a union that also held Animation would answer with either.
   */
  requireGenreIds?: number[];
  /** ISO 639-1, for an answer about where a title was made rather than its genre. */
  originalLanguage?: string;
  /** Minutes. Only meaningful for a film. */
  runtimeLte?: number;
  /** Exact provider keyword, resolved through its keyword search. */
  keyword?: string;
  /** Start from finished miniseries; exact season and episode limits are checked on details. */
  shortSeries?: boolean;
  sortBy?: "popularity" | "rating" | "recent";
  /**
   * Minimum number of votes. Left out, the provider picks a floor that suits
   * the sort; a caller lowers it when the query is already narrow enough that
   * the floor is what empties it rather than what cleans it up.
   */
  voteCountGte?: number;
  /**
   * Minimum average score, out of ten. Left out, the provider applies its own
   * floor: a suggestion is a recommendation, so a title nobody rates well has
   * no business being one, whatever the sort. A caller raises it for a shelf
   * that has to be short and strong, and lowers it only when the floor is what
   * empties the shelf rather than what cleans it up.
   */
  voteAverageGte?: number;
  page?: number;
  language?: string;
};

export type SeasonSummary = {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
};

export type EpisodeInfo = {
  providerEpisodeId: string | null;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  /** Scheduled broadcast date. Never means "available". */
  airDate: string | null;
};

export type SeriesDetails = {
  summary: MediaSummary;
  /** Raw provider status (`Returning Series`, `Ended`, ...). */
  status: string | null;
  inProduction: boolean;
  seasons: SeasonSummary[];
  /**
   * The latest broadcast and the next one, as the provider announces them.
   * Enough to tell what a show does this week without reading a whole season.
   */
  lastEpisode: EpisodeInfo | null;
  nextEpisode: EpisodeInfo | null;
};

/**
 * `language` is the visitor's detected language (`fr` or `en`); implementations
 * map it to whatever their API expects.
 */
export interface MediaMetadataProvider {
  readonly name: string;
  search(query: string, language?: string): Promise<MediaSummary[]>;
  details(
    kind: MediaKind,
    providerId: string,
    language?: string,
  ): Promise<MediaSummary>;
  seriesDetails(providerId: string, language?: string): Promise<SeriesDetails>;
  seasonEpisodes(
    providerId: string,
    season: number,
    language?: string,
  ): Promise<EpisodeInfo[]>;
  /** What everyone is watching right now, both kinds mixed. */
  trending(language?: string): Promise<MediaSummary[]>;
  /** Titles matching a shape rather than a name. */
  discoverBy(query: DiscoverQuery): Promise<MediaSummary[]>;
  /** Films not out yet, or shows currently airing. */
  upcoming(kind: MediaKind, language?: string): Promise<MediaSummary[]>;
  /** Titles the provider considers close to this one. */
  recommendations(
    kind: MediaKind,
    providerId: string,
    language?: string,
  ): Promise<MediaSummary[]>;
  genres(kind: MediaKind, language?: string): Promise<Genre[]>;
  /** Who signs a title and who plays in it. */
  credits(
    kind: MediaKind,
    providerId: string,
    language?: string,
  ): Promise<TitleCredits>;
  /** One person and everything they are credited on. */
  person(personId: string, language?: string): Promise<PersonDetails>;
}

/** A finished show no longer needs a daily sync. */
export function isRunning(
  details: Pick<SeriesDetails, "status" | "inProduction">,
) {
  if (details.inProduction) return true;
  return (
    details.status === "Returning Series" ||
    details.status === "In Production" ||
    details.status === "Planned"
  );
}

export function parseMediaKind(
  raw: string | null | undefined,
): MediaKind | null {
  if (raw === "movie") return "movie";
  if (raw === "tv" || raw === "show" || raw === "series") return "tv";
  return null;
}
