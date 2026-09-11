import type { ReportReason, ReportStatus } from "@/lib/db/schema";
import type { MediaKind } from "@/lib/providers/metadata";

/**
 * The shape of a report, as choices.
 *
 * A leaf module: it holds the rules that decide what a member may say and where
 * a report can go next, with no database and no network, so it is unit tested
 * like the parsers are. Everything a member expresses passes through here, and
 * that is the whole answer to "no free text": there is nothing to type.
 */

/** Where a member is pointing. */
export const REPORT_TARGETS = ["movie", "series", "season", "episode"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

/**
 * A film has no seasons, a season is not a series, and an episode cannot be out
 * of date on its own. Offering the wrong reason is how a report stops being
 * useful, so the list is decided here rather than in a component.
 */
const REASONS_BY_TARGET = {
  movie: [
    "wrong_content",
    "bad_quality",
    "missing_audio_track",
    "missing_subtitles",
    "playback_error",
    "duplicate_entry",
  ],
  series: [
    "series_outdated",
    "missing_season",
    "wrong_order",
    "wrong_content",
    "duplicate_entry",
  ],
  season: [
    "missing_season",
    "missing_episode",
    "wrong_order",
    "bad_quality",
    "missing_audio_track",
    "missing_subtitles",
  ],
  episode: [
    "missing_episode",
    "wrong_content",
    "bad_quality",
    "missing_audio_track",
    "missing_subtitles",
    "playback_error",
    "wrong_order",
  ],
} satisfies Record<ReportTarget, ReportReason[]>;

export function reasonsFor(target: ReportTarget): readonly ReportReason[] {
  return REASONS_BY_TARGET[target];
}

/**
 * The reasons that ask for content rather than point at a fault.
 *
 * A report row is the shape every one of these takes, because the
 * administration works one queue. But the member who pressed "ask for this
 * season" did not report anything: they asked for something that is not there
 * yet, and the follow-up page has to say so, or the gesture comes back under a
 * heading nobody recognises. So the nature of the gesture is read from its
 * reason, here, and the page sorts its two lists by it.
 *
 * The same three reasons are the ones a sync can settle on its own, which is no
 * coincidence: what a sync can settle is precisely what was missing rather than
 * wrong. They stay two lists because they answer two different questions.
 *
 * Everything not in here is a fault: the thing is on the server and something
 * about it is wrong.
 */
export const ASK_REASONS = [
  "missing_season",
  "missing_episode",
  "series_outdated",
] as const satisfies readonly ReportReason[];

export function isAsk(reason: ReportReason): boolean {
  return (ASK_REASONS as readonly ReportReason[]).includes(reason);
}

/**
 * The asks the administration has answered, waiting on the next scan.
 *
 * Presence is read from the index the sync fills, so between "it is done" and
 * the next pass a series still reads as short. This is what the administration
 * said in the meantime: the whole series is up to date, or these seasons are.
 * A list rather than a set, because it travels from the page to the panel as a
 * property.
 */
export type SettledAsks = {
  /** The series as a whole was declared up to date. */
  series: boolean;
  /** Seasons declared whole, by number. */
  seasons: readonly number[];
};

export const NOTHING_SETTLED: SettledAsks = { series: false, seasons: [] };

/**
 * Is this place covered by what the administration has just answered?
 *
 * A claim on the series covers every season under it: saying the show is up to
 * date and then offering to ask for one of its seasons would be the same
 * contradiction the badge exists to avoid.
 */
export function isSettled(
  settled: SettledAsks,
  seasonNumber: number | null,
): boolean {
  if (settled.series) return true;
  return seasonNumber !== null && settled.seasons.includes(seasonNumber);
}

/** Which of the four shapes a report is, from what the member selected. */
export function targetOf(
  kind: MediaKind,
  seasonNumber: number | null,
  episodeNumber: number | null,
): ReportTarget {
  if (kind === "movie") return "movie";
  if (episodeNumber !== null) return "episode";
  if (seasonNumber !== null) return "season";
  return "series";
}

export function isReasonAllowed(
  target: ReportTarget,
  reason: ReportReason,
): boolean {
  return reasonsFor(target).includes(reason);
}

/**
 * What can still be said about a re-cut.
 *
 * A re-cut is a fan edit: the picture, the tracks and the numbering are what
 * whoever made it chose, and nobody on this side can put another audio track
 * into it or fix its order. Offering "the quality is poor" or "an audio track
 * is missing" there sends the administration a queue of reports it can only
 * close, and teaches members that reporting achieves nothing.
 *
 * What is left is the one thing that can actually be acted on: there is not
 * all of it here yet, either in holes or at the end. Both are asks, so they
 * close themselves when the rest arrives, exactly like everywhere else.
 *
 * There is no "where" to answer either. A re-cut numbers itself, and the page
 * shows no ladder to point at, so the report is about the series and the
 * season and episode stay empty.
 */
export const CUT_REASONS = [
  "missing_episode",
  "series_outdated",
] as const satisfies readonly ReportReason[];

export function reasonsForCut(): readonly ReportReason[] {
  return CUT_REASONS;
}

export function isCutReasonAllowed(reason: ReportReason): boolean {
  return (CUT_REASONS as readonly ReportReason[]).includes(reason);
}

/**
 * The words for a reason, given where the member pointed.
 *
 * "Missing episode" is filed both on one episode and on a whole season, when a
 * member asks for the rest of a season that falls short. Read on its own the
 * second one says "an episode is missing" about a season half empty, and the
 * administration fetches one file where twenty were wanted. So without an
 * episode to point at, the reason speaks in the plural.
 */
export function reasonKey(report: {
  reason: ReportReason;
  episodeNumber: number | null;
}): `report.reason.${ReportReason | "missing_episodes"}` {
  if (report.reason === "missing_episode" && report.episodeNumber === null)
    return "report.reason.missing_episodes";
  return `report.reason.${report.reason}`;
}

/**
 * Key of one ask: the place it points at and the reason it gives.
 *
 * The pair the database makes unique among live reports, spelled the same way
 * on the server that reads them and in the component that has to know whether
 * the ask it is about to offer has already been made.
 */
export function askKey(ask: {
  seasonNumber: number | null;
  reason: ReportReason;
}): string {
  return `${ask.seasonNumber ?? "series"}:${ask.reason}`;
}

export const LIVE_REPORT_STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
] as const;

export function isLive(status: ReportStatus): boolean {
  return (LIVE_REPORT_STATUSES as readonly ReportStatus[]).includes(status);
}

/**
 * The legal moves, in one place, so the administration renders buttons from the
 * state machine instead of showing every status and hoping.
 *
 * A fault and an ask share the table and the statuses, not the path. A fault is
 * taken up, then worked on, then fixed. An ask has no step in between: taking
 * it up is fetching it, exactly as accepting a request is, so it goes from
 * taken up straight to settled.
 */
const FAULT_TRANSITIONS = {
  open: ["acknowledged", "rejected", "duplicate"],
  acknowledged: ["in_progress", "resolved", "rejected", "duplicate"],
  in_progress: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
  duplicate: [],
} satisfies Record<ReportStatus, ReportStatus[]>;

const ASK_TRANSITIONS = {
  open: ["acknowledged", "rejected", "duplicate"],
  acknowledged: ["resolved", "rejected", "duplicate"],
  in_progress: [],
  resolved: [],
  rejected: [],
  duplicate: [],
} satisfies Record<ReportStatus, ReportStatus[]>;

export function nextStatuses(
  from: ReportStatus,
  reason: ReportReason,
): readonly ReportStatus[] {
  return (isAsk(reason) ? ASK_TRANSITIONS : FAULT_TRANSITIONS)[from];
}

export function canTransition(
  from: ReportStatus,
  to: ReportStatus,
  reason: ReportReason,
): boolean {
  return nextStatuses(from, reason).includes(to);
}

/**
 * The three reasons a sync can settle on its own.
 *
 * Everything else describes something Umbra does not index: a codec, a track, a
 * playback failure. Nothing should ever try to close those automatically, since
 * doing so would mean walking media parts on the server, which Umbra
 * deliberately never does.
 */
const AUTO_CLOSABLE: readonly ReportReason[] = [
  "missing_episode",
  "missing_season",
  "series_outdated",
];

export function isAutoClosable(reason: ReportReason): boolean {
  return AUTO_CLOSABLE.includes(reason);
}
