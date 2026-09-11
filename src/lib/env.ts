import "server-only";

import { z } from "zod";

/**
 * Server configuration, validated once on first access.
 *
 * No third-party API secret lives here: TMDB and Plex credentials are held in
 * the Janus vault (see `JANUS.md`). Umbra only knows its own Janus key.
 *
 * Validation is lazy so that `next build` can run without a production
 * environment being present.
 */
/**
 * A boolean spelled out in the environment.
 *
 * `z.coerce.boolean()` is `Boolean(value)`, which reads the string "false" as
 * true, so a flag the deployment spells out as false would be on. The words are
 * therefore parsed rather than the truthiness of the string, and a variable
 * that is absent or empty falls back to the default rather than stopping the
 * boot, because Compose passes an unset variable through as an empty string. A
 * value that is neither true nor false is a typo in a security switch and fails
 * the boot loudly.
 */
function flag(fallback: boolean) {
  return z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === "" ? undefined : value.trim(),
    )
    .pipe(z.stringbool().default(fallback));
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),

  JANUS_URL: z.string().url(),
  JANUS_APPLICATION_ID: z.string().min(1),
  JANUS_API_KEY: z.string().min(1),
  /** Media library slug (the Plex server, exposed through Janus). */
  JANUS_LIBRARY_SLUG: z.string().min(1).default("kisuflix"),
  /** Metadata provider slug. */
  JANUS_METADATA_SLUG: z.string().min(1).default("tmdb-v3"),
  /** MyAnimeList slug, asked for member recommendations on anime only. */
  JANUS_ANIME_SLUG: z.string().min(1).default("myanimelist-v2"),
  /** plex.tv slug, used by the PIN sign-in flow. */
  JANUS_PLEX_TV_SLUG: z.string().min(1).default("plex-tv"),
  /**
   * plex.tv again, under a slug where Janus adds the owner's token.
   *
   * Only the membership sweep uses it, and it is optional: without it the
   * sweep does nothing and access still follows the server at each sign-in.
   */
  JANUS_PLEX_OWNER_SLUG: z.string().optional(),

  /** Plex account promoted to admin on its first sign-in. */
  ADMIN_PLEX_ACCOUNT_ID: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PLEX_PRODUCT: z.string().min(1).default("Umbra"),
  PLEX_CLIENT_ID: z.string().min(1).default("umbra-hub"),
  /** Opens the development sign-in route. Never enabled in production. */
  DEV_LOGIN: flag(false),

  /** `Movies:/data/movies,Series:/data/series` */
  STORAGE_PATHS: z.string().default(""),

  /** Token expected by the scheduled sync route. */
  CRON_SECRET: z.string().min(16).optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} (${issue.message})`)
      .join(", ");
    throw new Error(`Invalid configuration: ${missing}`);
  }

  cached = parsed.data;
  return cached;
}

/** Clears the cache. Test-only. */
export function resetEnvCache() {
  cached = null;
}

export type StorageVolumeConfig = { label: string; path: string };

/**
 * `Movies:/data/movies,/data/series` into published volumes.
 * On Windows, `C:\media` has no label: a single-character prefix is a drive
 * letter, not a label.
 */
export function parseStoragePaths(raw: string): StorageVolumeConfig[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator > 1) {
        return {
          label: entry.slice(0, separator).trim(),
          path: entry.slice(separator + 1).trim(),
        };
      }
      return { label: entry, path: entry };
    });
}

export function isProduction() {
  return env().NODE_ENV === "production";
}
