import { NextRequest } from "next/server";

import { idParam, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { withdrawRequest } from "@/lib/domain/requests";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Leaves a request. Who may do it and when live in the domain: only somebody
 * waiting on it, and only while the administrator has not taken it up.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireMember();
    checkRate("requests", account.id, perMinute(10));

    const id = await idParam(params);
    return withdrawRequest(id, account.id);
  });
}
