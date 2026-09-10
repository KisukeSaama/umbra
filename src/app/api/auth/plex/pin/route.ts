import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { openPin } from "@/lib/domain/auth-pins";
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

    return openPin();
  });
}
