import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { authPins } from "@/lib/db/schema";
import { authorizeUrl, createPin } from "@/lib/providers/plex-tv";
import { checkRate, clientAddress, perMinute } from "@/lib/rate-limit";

/**
 * Opens a Plex sign-in PIN.
 *
 * The PIN is stored so the confirmation step cannot be pointed at an arbitrary
 * plex.tv pin id by a caller.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    // Per address, then for everyone: the address can be a forged hint, the
    // global cap cannot. Both stay well under the plex.tv quota in Janus.
    checkRate("auth-pin", clientAddress(request.headers), perMinute(5));
    checkRate("auth-pin", "all", perMinute(60));

    const pin = await createPin();
    const [row] = await db()
      .insert(authPins)
      .values({
        plexPinId: pin.id,
        // plex.tv pins are short-lived; ours expire with them.
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      .returning({ id: authPins.id });

    return {
      pinId: row.id,
      code: pin.code,
      authorizeUrl: authorizeUrl(pin.code),
    };
  });
}
