import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { createSession, upsertAccountFromPlex } from "@/lib/auth/session";
import { bumpMetric } from "@/lib/domain/analytics";
import { consumePin, livePin } from "@/lib/domain/auth-pins";
import { accountOf, pollPin } from "@/lib/providers/plex-tv";
import { checkRate, clientAddress, perMinute } from "@/lib/rate-limit";

const schema = z.object({ pinId: z.uuid() });

/**
 * Confirms a sign-in PIN.
 *
 * Answers `waiting` until the visitor validates on plex.tv. Once validated, the
 * Plex token is used to read the account id and immediately dropped: Umbra
 * never stores it.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    /*
     * Three buckets, because the caller chooses one of the keys.
     *
     * The pin is polled every few seconds while somebody validates it on
     * plex.tv, which is what the first quota is sized for. But a pin id is
     * whatever the caller sends, so on its own it is a bucket per request and
     * no limit at all: the address and the global cap are what actually bound
     * an anonymous caller, exactly as when the pin was opened.
     */
    checkRate("auth-claim", clientAddress(request.headers), perMinute(60));
    checkRate("auth-claim", "all", perMinute(300));

    const { pinId } = await jsonBody(request, schema);
    checkRate("auth-claim", pinId, perMinute(30));

    const pin = await livePin(pinId);

    const token = await pollPin(pin.plexPinId);
    if (!token) return { status: "waiting" as const };

    const plexAccount = await accountOf(token);
    const account = await upsertAccountFromPlex(plexAccount);

    await consumePin(pinId);

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
