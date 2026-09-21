import type { ReportStatus, RequestStatus } from "@/lib/db/schema";

/**
 * How the administration queues are cut and read.
 *
 * Both queues are a desk worked through, and a desk is read by what still needs
 * a hand first: a refused request from last week sitting between two new ones
 * is a row the eye has to skip. So a queue is cut into stages, the one waiting
 * on a decision being the default, and each stage is read oldest first, newest
 * first, or by how many members are waiting on a title.
 *
 * Both are carried in the query string, so a filtered and sorted queue is an
 * address that can be shared, and the defaults carry no parameter.
 */

/**
 * Oldest first, as a desk is worked through, newest first to see what has just
 * come in, or the titles the most members are waiting on first, oldest first
 * among equals.
 */
export type QueueOrder = "oldest" | "recent" | "wanted";

const QUEUE_ORDERS: readonly QueueOrder[] = ["oldest", "recent", "wanted"];

export const QUEUE_STAGES = ["todo", "doing", "done", "all"] as const;

/**
 * Waiting on a decision, taken up and not settled, settled, or everything.
 */
export type QueueStage = (typeof QUEUE_STAGES)[number];

function first(value: string | string[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * How a stage reads when nothing is asked for.
 *
 * Work still to do is read oldest first, so nothing is left to linger. What is
 * settled is looked up rather than worked through, and the one looked for is
 * most often the last to have closed, so it reads newest first, as does the
 * whole queue at once.
 */
export function defaultQueueOrder(stage: QueueStage): QueueOrder {
  return stage === "todo" || stage === "doing" ? "oldest" : "recent";
}

/** Reads the order off the query string; anything unknown is the default. */
export function parseQueueOrder(
  value: string | string[] | null | undefined,
  stage: QueueStage,
): QueueOrder {
  const raw = first(value);
  return (
    QUEUE_ORDERS.find((order) => order === raw) ?? defaultQueueOrder(stage)
  );
}

/** Reads the stage off the query string; anything unknown is the default. */
export function parseQueueStage(
  value: string | string[] | null | undefined,
): QueueStage {
  const raw = first(value);
  return QUEUE_STAGES.find((stage) => stage === raw) ?? "todo";
}

/** The request statuses each stage holds; everything, for `all`. */
export const REQUEST_STAGE_STATUSES: Record<
  QueueStage,
  RequestStatus[] | undefined
> = {
  todo: ["requested"],
  doing: ["accepted"],
  done: ["available", "rejected", "removed"],
  all: undefined,
};

/** The report statuses each stage holds; everything, for `all`. */
export const REPORT_STAGE_STATUSES: Record<
  QueueStage,
  ReportStatus[] | undefined
> = {
  todo: ["open"],
  doing: ["acknowledged", "in_progress"],
  done: ["resolved", "rejected", "duplicate"],
  all: undefined,
};

/** One count per stage, for the tabs above a queue. */
export async function countByStage(
  count: (stage: QueueStage) => Promise<number>,
): Promise<Record<QueueStage, number>> {
  const counts = await Promise.all(QUEUE_STAGES.map(count));
  return Object.fromEntries(
    QUEUE_STAGES.map((stage, index) => [stage, counts[index] ?? 0]),
  ) as Record<QueueStage, number>;
}

/** The comparison `QueueOrder` stands for, for rows merged from two tables. */
export function compareQueueRows(
  order: QueueOrder,
): (
  left: { waiting: number; createdAt: Date },
  right: { waiting: number; createdAt: Date },
) => number {
  const newestFirst = order === "recent" ? -1 : 1;
  return (left, right) =>
    (order === "wanted" ? right.waiting - left.waiting : 0) ||
    newestFirst * (left.createdAt.getTime() - right.createdAt.getTime());
}

/**
 * What a row of the request queue is, for a move made on several at once.
 *
 * The queue interleaves two tables: a title asked for is a request, a season
 * or an episode asked for is filed as a report. The id alone does not say
 * which, so it travels with its kind.
 */
export type QueueItemKind = "request" | "ask";

/**
 * The moves the queue offers on a selection.
 *
 * Only the ones that mean the same thing on both sides of the queue: taking
 * the ask in hand, turning it down, putting it back. What needs a look at the
 * row itself (a duplicate, a report closed by hand) stays on the row.
 */
export const BULK_MOVES = ["accept", "reject", "reopen"] as const;
export type BulkMove = (typeof BULK_MOVES)[number];

const BULK_TARGETS = {
  request: { accept: "accepted", reject: "rejected", reopen: "requested" },
  ask: { accept: "acknowledged", reject: "rejected", reopen: "open" },
} as const satisfies {
  request: Record<BulkMove, RequestStatus>;
  ask: Record<BulkMove, ReportStatus>;
};

/** The status a move sends a request to. */
export function bulkRequestTarget(move: BulkMove): RequestStatus {
  return BULK_TARGETS.request[move];
}

/** The status a move sends an ask to. */
export function bulkAskTarget(move: BulkMove): ReportStatus {
  return BULK_TARGETS.ask[move];
}

/**
 * The moves a selection is offered, with how many of its rows each applies to.
 *
 * A move shows as soon as one ticked row can take it, and only those rows are
 * sent: in the "all" stage a selection mixes new asks with settled ones, and
 * offering nothing because one row is closed would make the selection useless
 * exactly where it is widest.
 */
export function bulkMovesFor(
  items: readonly { moves: readonly BulkMove[] }[],
): { move: BulkMove; count: number }[] {
  return BULK_MOVES.map((move) => ({
    move,
    count: items.filter((item) => item.moves.includes(move)).length,
  })).filter(({ count }) => count > 0);
}
