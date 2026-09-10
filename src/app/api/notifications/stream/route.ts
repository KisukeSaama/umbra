import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import {
  listNotifications,
  unreadNow,
  type NotificationRow,
} from "@/lib/domain/notifications";
import { onNotificationFor } from "@/lib/realtime";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * The bell, live.
 *
 * Server-sent events rather than a socket: everything here travels one way, from
 * the server to a member who is only reading, and the browser owns the
 * reconnection. It is also the only shape that survives the deployment as it
 * stands, where Next serves itself behind Traefik with no custom server to hang
 * an upgrade handler on.
 *
 * The stream carries the unread count and the entries that landed, never a
 * sentence: the client resolves the wording in its own language, exactly like
 * the panel and the follow-up page do.
 */

/** Under every idle timeout a proxy is likely to hold us to. */
const HEARTBEAT_MS = 25_000;

/** What one nudge may deliver. A member who was away reloads instead. */
const BURST = 10;

export async function GET(request: NextRequest) {
  let accountId: string;
  try {
    const account = await requireMember();
    // Reconnection is the browser's business and it is patient. A handful a
    // minute is a page being reloaded; more than that is a loop, and a loop
    // holding a database connection open is worth refusing.
    checkRate("notifications-stream", account.id, perMinute(30));
    accountId = account.id;
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      /**
       * The mark this stream has caught up to. Taken from the rows themselves
       * rather than from the clock, so nothing is skipped or repeated because
       * two machines disagree by a second.
       */
      let since: Date | null = null;

      // Declared below and read here: nothing calls this before the stream is
      // wired, and the alternative is two mutable slots for values that are set
      // exactly once.
      function close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // The client hung up first; there is nothing left to close.
        }
      }

      function send(chunk: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      }

      async function push(withEntries: boolean) {
        if (closed) return;
        try {
          let entries: NotificationRow[] = [];
          if (since === null) {
            // The mark starts at the newest entry this account already has, so
            // the first nudge announces what came after it and nothing else.
            const [newest] = await listNotifications(accountId, 1);
            since = newest?.createdAt ?? new Date();
          } else if (withEntries) {
            entries = await listNotifications(accountId, BURST, since);
            if (entries.length > 0) since = entries[0].createdAt;
          }

          send(
            `event: notifications\ndata: ${JSON.stringify({
              unread: await unreadNow(accountId),
              entries,
            })}\n\n`,
          );
        } catch (error) {
          console.error("[notifications] stream failed to read", error);
        }
      }

      // One at a time: two nudges arriving together would otherwise both read
      // from the same mark and announce the same entry twice.
      let queue = Promise.resolve();
      function schedule(withEntries: boolean) {
        queue = queue.then(() => push(withEntries));
      }

      // Nothing to wire for a client that has already gone: an aborted signal
      // never fires its listener, so the interval and the subscription would
      // stay behind for the life of the process.
      if (request.signal.aborted) {
        closed = true;
        return;
      }

      // A stream the account has too many of is told to end, and ending it is
      // the same close as a client hanging up.
      const unsubscribe = onNotificationFor(accountId, (event) => {
        if (event === "evicted") close();
        else schedule(true);
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      request.signal.addEventListener("abort", close);
      // The signal may have fired while those two were being set up.
      if (request.signal.aborted) {
        close();
        return;
      }

      // Five seconds is what the browser waits before reconnecting; the default
      // is three, and nothing here is urgent enough to knock that often.
      send("retry: 5000\n\n");

      // The count on arrival, which also proves the stream is open. No entries:
      // the page was rendered with them a moment ago.
      schedule(false);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Traefik passes a stream straight through, but a proxy that buffers
      // would hold every event back until the stream ended, which is never.
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";
