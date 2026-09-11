import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Umbra schema.
 *
 * Two principles: store only what is needed (no e-mail, no Plex token, no
 * per-person watch history), and let the database carry uniqueness rather than
 * application code. That is what makes the jobs idempotent.
 *
 * `taste_profile` is the one place a person's habits leave a trace, and it is
 * deliberately shaped so that they cannot: a handful of weighted genre ids,
 * replaced wholesale on every run over a rolling window. No title, no date, no
 * history. See `docs/adr/0007-aggregated-taste-profile.md`.
 */

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

/* ------------------------------------------------------------- identities -- */

/**
 * Roles, from the least to the most privileged.
 *
 * There is exactly one `admin`, because there is exactly one owner of the media
 * server. An `assistant` is a member the administrator has asked for help: same
 * workspace, minus the ability to hand out access. Uniqueness of the
 * administrator is enforced by `account_single_admin_idx`, not by application
 * code. See `docs/adr/0009-one-administrator-and-assistants.md`.
 */
export const ACCOUNT_ROLES = ["member", "assistant", "admin"] as const;
/** What the accounts page may set: help is granted, administration is not. */
export const ASSIGNABLE_ROLES = ["member", "assistant"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const accounts = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Plex account id: the only personal data kept, alongside the display name. */
    plexAccountId: text("plex_account_id").notNull().unique(),
    username: text("username").notNull(),
    role: text("role").$type<AccountRole>().notNull().default("member"),
    createdAt,
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "account_role_check",
      sql`${t.role} IN ('member', 'assistant', 'admin')`,
    ),
    // One administrator, always: a unique index over a single value refuses the
    // second one at the database rather than in a read-then-write.
    uniqueIndex("account_single_admin_idx")
      .on(t.role)
      .where(sql`${t.role} = 'admin'`),
  ],
);

export const sessions = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 digest of the token: the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt,
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("session_account_idx").on(t.accountId),
    index("session_expires_idx").on(t.expiresAt),
  ],
);

/** plex.tv PIN awaiting confirmation. Short-lived. */
export const authPins = pgTable("auth_pin", {
  id: uuid("id").primaryKey().defaultRandom(),
  plexPinId: text("plex_pin_id").notNull(),
  createdAt,
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ media -- */

export const MEDIA_TYPES = ["movie", "tv"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Metadata for a title Umbra knows about (requested or tracked).
 * Not a provider cache: Janus already caches the responses.
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("tmdb"),
    providerId: text("provider_id").notNull(),
    mediaType: text("media_type").$type<MediaType>().notNull(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    overview: text("overview"),
    releaseDate: date("release_date"),
    posterPath: text("poster_path"),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("media_provider_idx").on(t.provider, t.mediaType, t.providerId),
    check("media_type_check", sql`${t.mediaType} IN ('movie', 'tv')`),
  ],
);

/**
 * The media server's own vocabulary.
 *
 * `season` is in the list because the server files one and the index accepts
 * it, not because anything writes one: the two listings a sync reads answer
 * with shows and with episodes. It stays so that a row arriving under that
 * name is stored rather than dropped.
 */
export const LIBRARY_KINDS = ["movie", "show", "season", "episode"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * Local index of the server library, filled by the sync job. Lets Umbra answer
 * "already available" without calling the server on every search.
 */
export const libraryItems = pgTable(
  "library_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ratingKey: text("rating_key").notNull().unique(),
    kind: text("kind").$type<LibraryKind>().notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    tmdbId: text("tmdb_id"),
    tvdbId: text("tvdb_id"),
    imdbId: text("imdb_id"),
    parentRatingKey: text("parent_rating_key"),
    grandparentRatingKey: text("grandparent_rating_key"),
    grandparentTitle: text("grandparent_title"),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    sectionKey: text("section_key"),
    /** Poster path, filled from the metadata provider so the browser never
     *  talks to the media server. */
    posterPath: text("poster_path"),
    /**
     * Metadata provider genre ids, filled by the same enrichment pass as the
     * poster: the details call already carries them, so this costs no extra
     * request. Not personal data, and what the taste profile is built from.
     */
    genreIds: integer("genre_ids").array(),
    /**
     * The provider score, out of ten, and the votes behind it. Filled by the
     * same enrichment pass, from a details call that already carries them.
     *
     * Null means the pass has not reached this row yet, and reads treat that as
     * "unknown" rather than "bad": the index fills in over several runs, and a
     * quality filter that took null for a failing score would empty the shelves
     * in the meantime. Zero is an answer, and it is what a title nobody rated
     * gets, so a row is stamped once and never comes back.
     */
    voteAverage: real("vote_average"),
    voteCount: integer("vote_count"),
    /**
     * The original language, ISO 639-1, and a film's runtime in minutes. Filled
     * by the same enrichment pass, so the picker answers a language or a length
     * from the index rather than with one provider call per title, which is
     * what ran it into the gateway's quota mid-selection.
     *
     * An empty language and a zero runtime mean the provider does not say,
     * which fails the question the way an unknown detail always has. Null means
     * the pass has not looked yet, and the picker asks the provider instead.
     */
    originalLanguage: text("original_language"),
    runtime: integer("runtime"),
    /**
     * The provider id of a re-cut the media server matched to nothing.
     *
     * A re-cut filed as personal media carries no guid at all, so the sync
     * leaves `tmdb_id` empty and the title is invisible to everything that
     * reads presence. This is what a later pass works out from the name, and
     * it is kept apart from `tmdb_id` on purpose: the sync overwrites that
     * column from what the server says on every run, the tracker links its
     * series on it, and neither should be handed a link Umbra inferred.
     */
    cutProviderId: text("cut_provider_id"),
    /**
     * When that pass last looked at this row. A name it could not resolve is
     * retried later rather than on every run, and a row it never reached is
     * told apart from one it gave up on.
     */
    cutCheckedAt: timestamp("cut_checked_at", { withTimezone: true }),
    /**
     * When the enrichment pass last looked at this row.
     *
     * Without it the pass starved. A title the provider has no poster for
     * leaves `poster_path` null forever, the selection asks for rows that are
     * still missing something newest first, and once a screenful of those sat
     * at the top the same rows were fetched on every run while the older ones
     * behind them never got their genres or their score. Stamped whether the
     * call answered or not, so a row that cannot be filled waits its turn
     * instead of taking everyone else's.
     */
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("library_item_tmdb_idx").on(t.tmdbId, t.kind),
    // What the sweep at the end of every sync reads.
    index("library_item_section_synced_idx").on(t.sectionKey, t.syncedAt),
    index("library_item_cut_idx").on(t.cutProviderId, t.kind),
    index("library_item_added_idx").on(t.addedAt),
    index("library_item_episode_idx").on(
      t.grandparentRatingKey,
      t.seasonNumber,
      t.episodeNumber,
    ),
    check(
      "library_item_kind_check",
      sql`${t.kind} IN ('movie', 'show', 'season', 'episode')`,
    ),
  ],
);

/* --------------------------------------------------------------- requests -- */

export const REQUEST_STATUSES = [
  "requested",
  "accepted",
  "available",
  "rejected",
  "removed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * Statuses that no longer hold a title's one live request.
 *
 * A refused title can be asked for again, and so can one that reached the
 * server and was later deleted from it: the request that brought it keeps its
 * history as `removed`, and the next ask is a new row. Every read of "the live
 * request for this title" excludes these, as the unique index below does.
 */
export const CLOSED_REQUEST_STATUSES = [
  "rejected",
  "removed",
] as const satisfies readonly RequestStatus[];

export const mediaRequests = pgTable(
  "media_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").references(() => accounts.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<RequestStatus>()
      .notNull()
      .default("requested"),
    adminNote: text("admin_note"),
    createdAt,
    updatedAt,
  },
  (t) => [
    // One live request per title: deduplication is enforced by the database.
    uniqueIndex("media_request_active_idx")
      .on(t.mediaId)
      .where(sql`status NOT IN ('rejected', 'removed')`),
    index("media_request_status_idx").on(t.status, t.createdAt),
    // What the queue reads to find an earlier request for the same title.
    index("media_request_media_idx").on(t.mediaId, t.status),
    // The follow-up page and the discover shelves both read a person's own.
    index("media_request_requester_idx").on(t.requestedBy, t.createdAt),
    check(
      "media_request_status_check",
      sql`${t.status} IN ('requested', 'accepted', 'available', 'rejected', 'removed')`,
    ),
  ],
);

/**
 * Who is waiting on a request, the person who opened it included.
 *
 * The twin of `report_follower`. A second member asking for a title already on
 * the list joins the request instead of being turned away, hears about every
 * step, and counts: how many people want a title is what the administration
 * reads to decide what to fetch first. Members see the number on the title page
 * alone, beside the ask. See `docs/adr/0016-requests-have-followers.md`.
 */
export const requestFollowers = pgTable(
  "request_follower",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => mediaRequests.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.accountId] }),
    index("request_follower_account_idx").on(t.accountId),
  ],
);

/* ---------------------------------------------------- series and episodes -- */

export const trackedSeries = pgTable("tracked_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .unique()
    .references(() => media.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  /** Raw provider status (`Returning Series`, `Ended`, ...). */
  providerStatus: text("provider_status"),
  /** Server-side key of the show, discovered by the library sync. */
  plexRatingKey: text("plex_rating_key"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt,
});

export const EPISODE_STATUSES = [
  "scheduled",
  "aired_missing",
  "available",
] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export const episodes = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => trackedSeries.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    providerEpisodeId: text("provider_episode_id"),
    title: text("title"),
    /** Scheduled broadcast. Never means "available to download". */
    airDate: date("air_date"),
    plexAvailable: boolean("plex_available").notNull().default(false),
    plexCheckedAt: timestamp("plex_checked_at", { withTimezone: true }),
    status: text("status")
      .$type<EpisodeStatus>()
      .notNull()
      .default("scheduled"),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("episode_unique_idx").on(
      t.seriesId,
      t.seasonNumber,
      t.episodeNumber,
    ),
    index("episode_air_date_idx").on(t.airDate),
    index("episode_status_idx").on(t.status),
    check(
      "episode_status_check",
      sql`${t.status} IN ('scheduled', 'aired_missing', 'available')`,
    ),
  ],
);

export const EPISODE_TASK_STATUSES = ["open", "done", "dismissed"] as const;
export type EpisodeTaskStatus = (typeof EPISODE_TASK_STATUSES)[number];

/** Admin task raised when an aired episode is still missing from the server. */
export const episodeTasks = pgTable(
  "episode_task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .unique()
      .references(() => episodes.id, { onDelete: "cascade" }),
    status: text("status").$type<EpisodeTaskStatus>().notNull().default("open"),
    createdAt,
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("episode_task_status_idx").on(t.status, t.createdAt),
    check(
      "episode_task_status_check",
      sql`${t.status} IN ('open', 'done', 'dismissed')`,
    ),
  ],
);

/* -------------------------------------------------------------- community -- */

export const ANNOUNCEMENT_CATEGORIES = [
  "information",
  "infrastructure",
  "content",
  "update",
  "storage",
  "funding",
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

/** The shape of an embedded page: a video, a square, or a tall document. */
export const EMBED_RATIOS = ["wide", "square", "tall"] as const;
export type EmbedRatio = (typeof EMBED_RATIOS)[number];

export const announcements = pgTable(
  "announcement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category")
      .$type<AnnouncementCategory>()
      .notNull()
      .default("information"),
    published: boolean("published").notNull().default(false),
    /**
     * One outward link, for the note that exists to point somewhere: the
     * fundraiser page, a status page, a changelog. Umbra never handles the
     * money, it only carries the address (see `docs/adr/0010-no-funding-goal.md`).
     */
    linkUrl: text("link_url"),
    linkLabel: text("link_label"),
    /**
     * One page set inside the note: a trailer, a map, a form. The browser loads
     * it straight from its host, so nothing is fetched or stored on this side;
     * the title is what a screen reader announces for the frame. See
     * `docs/adr/0018-a-note-can-embed-a-page.md`.
     */
    embedUrl: text("embed_url"),
    embedTitle: text("embed_title"),
    embedRatio: text("embed_ratio").$type<EmbedRatio>(),
    createdAt,
    updatedAt,
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("announcement_published_idx").on(t.published, t.publishedAt),
    check(
      "announcement_category_check",
      sql`${t.category} IN ('information', 'infrastructure', 'content', 'update', 'storage', 'funding')`,
    ),
    check(
      "announcement_embed_ratio_check",
      sql`${t.embedRatio} IS NULL OR ${t.embedRatio} IN ('wide', 'square', 'tall')`,
    ),
  ],
);

export const REACTION_VALUES = ["like", "dislike"] as const;
export type ReactionValue = (typeof REACTION_VALUES)[number];

/**
 * A thumb up or down on a note.
 *
 * A choice from two, never a word, so it needs no moderation. One row per
 * person and note, which the primary key enforces: changing one's mind moves
 * the row, taking it back deletes it. Members read the two counts only; who
 * reacted is shown to the staff alone.
 */
export const announcementReactions = pgTable(
  "announcement_reaction",
  {
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    value: text("value").$type<ReactionValue>().notNull(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.accountId] }),
    check(
      "announcement_reaction_value_check",
      sql`${t.value} IN ('like', 'dislike')`,
    ),
  ],
);

/**
 * A poll is an announcement that asks something back.
 *
 * It never exists on its own: the question always hangs off a note, so the
 * community reads one stream rather than two, and the administrator writes in
 * one place.
 */
export const polls = pgTable(
  "poll",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    active: boolean("active").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt,
  },
  // One question per note: a second one would be a second note.
  (t) => [uniqueIndex("poll_announcement_idx").on(t.announcementId)],
);

export const pollOptions = pgTable(
  "poll_option",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("poll_option_poll_idx").on(t.pollId, t.position)],
);

export const votes = pgTable(
  "vote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt,
  },
  // One vote per person per poll.
  (t) => [uniqueIndex("vote_unique_idx").on(t.pollId, t.accountId)],
);

/* ---------------------------------------------------------------- storage -- */

export type StorageVolume = {
  label: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
};

export const storageSnapshots = pgTable(
  "storage_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull(),
    availableBytes: bigint("available_bytes", { mode: "number" }).notNull(),
    /** Per-volume detail, admin only. */
    volumes: jsonb("volumes").$type<StorageVolume[]>().notNull().default([]),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("storage_snapshot_recorded_idx").on(t.recordedAt)],
);

/**
 * One node of the measured tree.
 *
 * `bytes` is the total the node accounts for, itself included, so a directory
 * can be drawn without walking its children. The tree holds every directory
 * and no file: files weigh in their parent, and the ones in the folder being
 * looked at come from the listing the explorer reads live. `kind` stays,
 * because the map draws both from the same shape.
 */
export type StorageNode = {
  name: string;
  bytes: number;
  kind: "directory" | "file";
  children?: StorageNode[];
};

/**
 * What actually fills the disk, measured by walking the configured paths.
 *
 * The walk is slow, so it is a scheduled job rather than something a page does:
 * the administration reads the last snapshot. Paths still come from
 * configuration alone, and only the label of a root ever leaves the server.
 */

export const storageTreeSnapshots = pgTable(
  "storage_tree_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** One entry per configured volume, deepest detail first. */
    roots: jsonb("roots").$type<StorageNode[]>().notNull().default([]),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
    fileCount: integer("file_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    /**
     * What a film and an episode typically weigh on this server, worked out
     * from the tree when it is measured. Kept apart from `roots` so the home
     * page can say what the free space holds without reading the whole map.
     */
    movieBytes: bigint("movie_bytes", { mode: "number" }),
    episodeBytes: bigint("episode_bytes", { mode: "number" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("storage_tree_snapshot_scanned_idx").on(t.scannedAt)],
);

/* --------------------------------------------------------------- job runs -- */

/** Job resume state: this is what makes catching up after downtime possible. */
export const jobState = pgTable("job_state", {
  jobName: text("job_name").primaryKey(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  cursor: jsonb("cursor"),
});

export const JOB_RUN_STATUSES = ["running", "success", "failure"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const jobRuns = pgTable(
  "job_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobName: text("job_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").$type<JobRunStatus>().notNull().default("running"),
    itemsProcessed: integer("items_processed").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    index("job_run_name_idx").on(t.jobName, t.startedAt),
    /*
     * One run of a step at a time, and the database is what says so.
     *
     * Asking "is anything running" and then starting is two statements, and
     * the worker's call and the administrator's button can land between them.
     * A second insert now fails instead, which the runner reads as "someone
     * else holds this step" rather than as an error.
     */
    uniqueIndex("job_run_single_running_idx")
      .on(t.jobName)
      .where(sql`status = 'running'`),
    check(
      "job_run_status_check",
      sql`${t.status} IN ('running', 'success', 'failure')`,
    ),
  ],
);

/** Daily usage counters. No person identifier, ever. */
export const analyticsDaily = pgTable(
  "analytics_daily",
  {
    day: date("day").notNull(),
    metric: text("metric").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric] })],
);

/* ---------------------------------------------------------------- reports -- */

/**
 * Why a member is raising their hand. A closed list, and the whole reason the
 * feature can exist without a comment box: a report is a series of choices, so
 * there is nothing to moderate and nothing to translate.
 */
export const REPORT_REASONS = [
  "missing_episode",
  "missing_season",
  "series_outdated",
  "wrong_content",
  "bad_quality",
  "missing_audio_track",
  "missing_subtitles",
  "playback_error",
  "duplicate_entry",
  "wrong_order",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "rejected",
  "duplicate",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * A problem reported on something that is supposed to be on the server.
 *
 * The target is a `media` row rather than a `library_item`: the library index is
 * rebuilt by every sync, entries not seen in a pass are dropped, and a report
 * must not die because a scan hiccuped. `library_rating_key` keeps the server
 * key seen at the time, so the administrator can still find the object.
 */
export const reports = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    reportedBy: uuid("reported_by").references(() => accounts.id, {
      onDelete: "set null",
    }),
    /** Null means the whole title, a season alone means the whole season. */
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    libraryRatingKey: text("library_rating_key"),
    reason: text("reason").$type<ReportReason>().notNull(),
    status: text("status").$type<ReportStatus>().notNull().default("open"),
    /**
     * A word from the administration to the members waiting on this report.
     *
     * The same one-way exception as `media_request.admin_note`: nothing is ever
     * typed by a member. It parts ways with the request note at the end. A
     * request that arrives has answered itself, so its note goes with it; a
     * report that closes has not, and this is where the outcome is read, so it
     * survives closing. One column and not a thread: a word that has aged is
     * replaced, never appended to.
     */
    adminNote: text("admin_note"),
    createdAt,
    updatedAt,
    /** Taken up by the administrator. */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    /** Resolved, refused or merged. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    /**
     * One live report per title, place and reason.
     *
     * `coalesce` is not decoration: in Postgres two NULLs never collide, so
     * without it "the whole series" would duplicate on every click. The second
     * member to report the same thing joins the existing one instead.
     */
    uniqueIndex("report_active_idx")
      .on(
        t.mediaId,
        sql`(coalesce(${t.seasonNumber}, -1))`,
        sql`(coalesce(${t.episodeNumber}, -1))`,
        t.reason,
      )
      .where(sql`status NOT IN ('resolved', 'rejected', 'duplicate')`),
    index("report_status_idx").on(t.status, t.createdAt),
    index("report_media_idx").on(t.mediaId),
    index("report_live_idx").on(t.status, t.reason),
    // An episode without its season is not a place anyone can point at.
    check(
      "report_scope_check",
      sql`${t.episodeNumber} IS NULL OR ${t.seasonNumber} IS NOT NULL`,
    ),
    check(
      "report_reason_check",
      sql`${t.reason} IN ('missing_episode', 'missing_season', 'series_outdated', 'wrong_content', 'bad_quality', 'missing_audio_track', 'missing_subtitles', 'playback_error', 'duplicate_entry', 'wrong_order')`,
    ),
    check(
      "report_status_check",
      sql`${t.status} IN ('open', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'duplicate')`,
    ),
  ],
);

/**
 * Who else is waiting on this report.
 *
 * It exists so a second reporter can follow the outcome in their own page, and
 * its count tells the staff how many people a fix will answer. That number is
 * never shown to members. See `docs/adr/0016-requests-have-followers.md`.
 */
export const reportFollowers = pgTable(
  "report_follower",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.reportId, t.accountId] }),
    index("report_follower_account_idx").on(t.accountId),
  ],
);

/* ---------------------------------------------------------- notifications -- */

export const NOTIFICATION_KINDS = [
  "request_status",
  "report_status",
  "announcement",
  "poll_open",
  /*
   * An episode arriving on its own is not announced today, and this is
   * deliberate rather than unfinished: the tracker knows, but telling every
   * member about every episode of every series they once asked for is a feed,
   * not a bell. The kind stays because the check constraint is the vocabulary
   * of the table, and widening it later is a migration where keeping it is
   * free.
   */
  "episode_available",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * What a member is told, and the trace of it.
 *
 * `payload` holds data and never a sentence: the client resolves a translation
 * key in its own language, exactly like `messageKey` on an API error. It is
 * also what the follow-up page draws its timeline from, which is why there is
 * no separate history table.
 */
export type NotificationPayload = {
  title?: string;
  status?: string;
  /**
   * The one exception to the rule above: a word an administrator attached to a
   * request when taking it in hand. It cannot be translated, because it is
   * written rather than resolved, and it disappears with the request note the
   * moment the title reaches the server.
   */
  note?: string;
  reason?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  category?: string;
};

export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    /** The request, report, announcement or poll this is about. */
    subjectId: uuid("subject_id"),
    /** What makes this entry distinct for that subject, such as a new status. */
    dedupKey: text("dedup_key").notNull(),
    payload: jsonb("payload")
      .$type<NotificationPayload>()
      .notNull()
      .default({}),
    createdAt,
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    /**
     * What lets every fan-out be replayed with `ON CONFLICT DO NOTHING`, which
     * is the condition for the jobs to stay idempotent. The key carries the
     * subject and the step it announces, so the status has to be part of it:
     * keyed on the subject alone, a request going accepted then available
     * would tell the member about the first and never about the second.
     */
    uniqueIndex("notification_unique_idx").on(t.accountId, t.dedupKey),
    index("notification_account_idx").on(t.accountId, t.createdAt),
    index("notification_unread_idx")
      .on(t.accountId)
      .where(sql`read_at IS NULL`),
    index("notification_subject_idx").on(t.subjectId, t.createdAt),
    check(
      "notification_kind_check",
      sql`${t.kind} IN ('request_status', 'report_status', 'announcement', 'poll_open', 'episode_available')`,
    ),
  ],
);

/* ---------------------------------------------------------- taste profile -- */

/**
 * A few weighted genres per account, and nothing else.
 *
 * Never a watched title, never a date: the job reads a rolling window from the
 * media server and replaces these rows wholesale, so nothing accumulates. See
 * `docs/adr/0007-aggregated-taste-profile.md`.
 */
export const tasteProfiles = pgTable(
  "taste_profile",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /**
     * Films and shows do not share a genre numbering at the provider, and the
     * mismatch is silent: a show id sent to a film listing simply returns
     * nothing. The kind is part of the key so a weight is never read in the
     * wrong space.
     */
    mediaKind: text("media_kind").$type<MediaType>().notNull(),
    /** Metadata provider genre id, in the numbering of that kind. */
    genreId: integer("genre_id").notNull(),
    weight: integer("weight").notNull().default(0),
    updatedAt,
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.mediaKind, t.genreId] }),
    index("taste_profile_weight_idx").on(t.accountId, t.weight),
    check("taste_profile_kind_check", sql`${t.mediaKind} IN ('movie', 'tv')`),
  ],
);
