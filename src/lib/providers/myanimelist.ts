import "server-only";

import { env } from "@/lib/env";
import { janus } from "@/lib/janus";

/**
 * MyAnimeList, through Janus (`/gateway/myanimelist-v2`).
 *
 * Only asked about anime, and only for one thing TMDB does badly: which titles
 * people who watched one anime recommend next. Its recommendations are votes
 * cast by members, one pair at a time, where TMDB's are computed from keywords
 * and genres and answer Death Note with whatever is popular and animated.
 *
 * MAL ids never leave this module's callers: a recommendation is looked up on
 * TMDB by title before anything is shown, so the rest of Umbra keeps a single
 * provider id per title. Janus adds the client id and holds the cache.
 */

/** One entry of the MAL catalogue, as much as matching it against TMDB needs. */
export type AnimeRef = {
  malId: number;
  title: string;
  /** `tv`, `ona`, `ova`, `movie`, `special`, `tv_special`, `music`... */
  mediaType: string | null;
  /** `YYYY-MM-DD`, `YYYY-MM` or `YYYY`: MAL gives what it knows. */
  startDate: string | null;
};

/** A title members recommend alongside another, and how many of them did. */
export type AnimeRecommendation = {
  malId: number;
  title: string;
  votes: number;
};

type Json = Record<string, unknown>;

/** MAL refuses a search shorter than three characters or longer than 64. */
const QUERY_MIN = 3;
const QUERY_MAX = 64;

async function get<T = Json>(
  path: string,
  query: Record<string, string | number> = {},
) {
  return janus<T>({ slug: env().JANUS_ANIME_SLUG, path, query });
}

export const myAnimeList = {
  async search(query: string): Promise<AnimeRef[]> {
    const q = query.trim().slice(0, QUERY_MAX);
    if (q.length < QUERY_MIN) return [];
    const body = await get("/anime", {
      q,
      limit: 10,
      fields: "media_type,start_date",
    });
    return animeRefsFromJson(body);
  },

  async recommendations(malId: number): Promise<AnimeRecommendation[]> {
    const body = await get(`/anime/${Math.trunc(malId)}`, {
      fields: "recommendations",
    });
    return recommendationsFromJson(body);
  },
};

/** A search answer: `{ data: [{ node: {...} }] }`. */
export function animeRefsFromJson(body: unknown): AnimeRef[] {
  if (!isJson(body) || !Array.isArray(body.data)) return [];
  return body.data
    .map((row) => (isJson(row) ? animeRefFromNode(row.node) : null))
    .filter((row): row is AnimeRef => row !== null);
}

/**
 * The recommendations of one anime, most voted first. MAL already sends them
 * in that order; sorting again costs nothing and does not depend on it.
 */
export function recommendationsFromJson(body: unknown): AnimeRecommendation[] {
  if (!isJson(body) || !Array.isArray(body.recommendations)) return [];
  return body.recommendations
    .map((row) => {
      if (!isJson(row)) return null;
      const node = animeRefFromNode(row.node);
      if (!node) return null;
      const votes =
        typeof row.num_recommendations === "number"
          ? row.num_recommendations
          : 0;
      return { malId: node.malId, title: node.title, votes };
    })
    .filter((row): row is AnimeRecommendation => row !== null)
    .sort((a, b) => b.votes - a.votes);
}

function animeRefFromNode(node: unknown): AnimeRef | null {
  if (!isJson(node)) return null;
  const malId = node.id;
  const title = typeof node.title === "string" ? node.title.trim() : "";
  if (typeof malId !== "number" || !Number.isFinite(malId) || !title)
    return null;
  return {
    malId,
    title,
    mediaType: typeof node.media_type === "string" ? node.media_type : null,
    startDate: typeof node.start_date === "string" ? node.start_date : null,
  };
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
