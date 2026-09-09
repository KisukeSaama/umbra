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

/** Still waiting on someone. Mirrors the partial unique index on `report`. */
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
 */
const TRANSITIONS = {
  open: ["acknowledged", "rejected", "duplicate"],
  acknowledged: ["in_progress", "resolved", "rejected", "duplicate"],
  in_progress: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
  duplicate: [],
} satisfies Record<ReportStatus, ReportStatus[]>;

export function nextStatuses(from: ReportStatus): readonly ReportStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return nextStatuses(from).includes(to);
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
