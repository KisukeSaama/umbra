import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { createSession, upsertAccountFromPlex } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { authPins } from "@/lib/db/schema";
import { bumpMetric } from "@/lib/domain/analytics";
import { BadRequestError } from "@/lib/errors";
import { accountOf, pollPin } from "@/lib/providers/plex-tv";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ pinId: z.string().uuid() });

/**
 * Confirms a sign-in PIN.
 *
 * Answers `waiting` until the visitor validates on plex.tv. Once validated, the
 * Plex token is used to read the account id and immediately dropped: Umbra
 * never stores it.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    const { pinId } = await jsonBody(request, schema);
    checkRate("auth-claim", pinId, perMinute(30));

    const [pin] = await db()
      .select()
      .from(authPins)
      .where(
        and(
          eq(authPins.id, pinId),
          isNull(authPins.consumedAt),
          gt(authPins.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!pin) throw new BadRequestError("error.invalidPin");

    const token = await pollPin(pin.plexPinId);
    if (!token) return { status: "waiting" as const };

    const plexAccount = await accountOf(token);
    const account = await upsertAccountFromPlex(plexAccount);

    await db()
      .update(authPins)
      .set({ consumedAt: new Date() })
      .where(eq(authPins.id, pin.id));

    if (account.status !== "approved") {
      return { status: "pending" as const };
    }

    await createSession(account.id);
    await bumpMetric("logins");

    return {
      status: "approved" as const,
      account: { username: account.username, role: account.role },
    };
  });
}
