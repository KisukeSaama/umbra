import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { authPins } from "@/lib/db/schema";
import { authorizeUrl, createPin } from "@/lib/providers/plex-tv";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Opens a Plex sign-in PIN.
 *
 * The PIN is stored so the confirmation step cannot be pointed at an arbitrary
 * plex.tv pin id by a caller.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    checkRate("auth-pin", clientKey(request), perMinute(5));

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

export function clientKey(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  );
}
