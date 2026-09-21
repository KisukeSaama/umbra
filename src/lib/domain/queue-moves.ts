import "server-only";

import { updateReportStatus } from "@/lib/domain/reports";
import { updateRequestStatus } from "@/lib/domain/requests";
import { AppError } from "@/lib/errors";
import {
  bulkAskTarget,
  bulkRequestTarget,
  type BulkMove,
  type QueueItemKind,
} from "@/lib/queue";

export type QueueMoveOutcome = {
  moved: number;
  /** The rows the move did not reach, and why, in the order they were sent. */
  failed: { id: string; messageKey: string }[];
};

/**
 * Makes one move on several rows of the request queue.
 *
 * Each row goes through the same function its own button calls, one after the
 * other, so a selection is checked, notified and tracked exactly as the rows
 * would have been one by one: nothing here knows a rule of its own. One after
 * the other rather than all at once, because accepting a series calls the
 * metadata provider and twenty of those in the same instant is a burst Janus
 * would rightly throttle.
 *
 * A row that refuses the move does not stop the others. Between the tick and
 * the press a colleague may have settled it, and that is an answer about that
 * row, not about the selection; it is reported back and the rest goes on.
 */
export async function moveQueueItems(
  items: readonly { kind: QueueItemKind; id: string }[],
  move: BulkMove,
  adminNote?: string | null,
): Promise<QueueMoveOutcome> {
  const note = bulkNote(move, adminNote);
  const outcome: QueueMoveOutcome = { moved: 0, failed: [] };

  for (const item of items) {
    try {
      if (item.kind === "request")
        await updateRequestStatus(item.id, bulkRequestTarget(move), note);
      else await updateReportStatus(item.id, bulkAskTarget(move), note);
      outcome.moved += 1;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      outcome.failed.push({ id: item.id, messageKey: error.messageKey });
    }
  }

  return outcome;
}

/**
 * What the one word typed does to every row it is sent to.
 *
 * Accepting opens on nothing, since the rows each have their own word and the
 * box cannot show them all: left empty, it leaves those words alone. Refusing
 * opens on nothing too, as it does on a row, and there an empty box means no
 * word, because what was said while fetching the title is no longer true once
 * it is declined. Reopening says nothing, as on a row.
 */
export function bulkNote(
  move: BulkMove,
  adminNote?: string | null,
): string | null | undefined {
  const typed = adminNote?.trim() || null;
  switch (move) {
    case "accept":
      return typed ?? undefined;
    case "reject":
      return typed;
    case "reopen":
      return undefined;
  }
}
