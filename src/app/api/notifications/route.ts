import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import {
  listNotifications,
  markRead,
  unreadCount,
} from "@/lib/domain/notifications";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * What has moved since last time.
 *
 * The header renders its count on the server, so this route exists for the
 * panel a member actually opens, and for marking it read afterwards.
 */
export async function GET() {
  return route(async () => {
    const account = await requireMember();
    checkRate("notifications", account.id, perMinute(60));

    const [items, unread] = await Promise.all([
      listNotifications(account.id),
      unreadCount(account.id),
    ]);
    return { items, unread };
  });
}

const readSchema = z.object({
  ids: z.array(z.uuid()).max(100).optional(),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("notifications", account.id, perMinute(60));

    const { ids } = await jsonBody(request, readSchema);
    return { read: await markRead(account.id, ids) };
  });
}

export const dynamic = "force-dynamic";
