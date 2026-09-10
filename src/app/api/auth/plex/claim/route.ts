import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import {
  createSession,
  revokeSessionsForPlexAccount,
  upsertAccountFromPlex,
} from "@/lib/auth/session";
import { bumpMetric } from "@/lib/domain/analytics";
import { consumePin, livePin } from "@/lib/domain/auth-pins";
import { plexLibrary } from "@/lib/providers/plex";
import { accountOf, hasServerAccess, pollPin } from "@/lib/providers/plex-tv";
import { checkRate, clientAddress, perMinute } from "@/lib/rate-limit";

const schema = z.object({ pinId: z.uuid() });

/**
 * Confirms a sign-in PIN.
 *
 * Answers `waiting` until the visitor validates on plex.tv. Once validated, the
 * Plex token is used to read the account id, to ask plex.tv whether the server
 * is currently shared with that person, and immediately dropped: Umbra never
 * stores it.
 *
 * Someone the server is not shared with is answered `denied` and no account is
 * created for them. See `docs/adr/0014-only-members-of-the-server.md`.
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

    /*
     * Membership is read now, from the visitor's own token, rather than from
     * anything Umbra keeps: a share taken back on plex.tv is already gone from
     * that answer. It is the only gate, so an upstream failure refuses the
     * sign-in rather than letting it through.
     */
    const machineIdentifier = await plexLibrary.machineIdentifier();
    if (!(await hasServerAccess(token, machineIdentifier))) {
      await consumePin(pinId);
      await revokeSessionsForPlexAccount(plexAccount.id);
      return { status: "denied" as const };
    }

    const account = await upsertAccountFromPlex(plexAccount);

    await consumePin(pinId);
    await createSession(account.id);
    await bumpMetric("logins");

    return {
      status: "approved" as const,
      account: { username: account.username, role: account.role },
    };
  });
}
