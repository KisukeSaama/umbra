import { route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { randomAvailableItem } from "@/lib/domain/library";
import { checkRate, perMinute } from "@/lib/rate-limit";

/** "I do not know what to watch": one random title from the server library. */
export async function GET() {
  return route(async () => {
    const account = await requireMember();
    checkRate("discover", account.id, perMinute(20));

    return { item: await randomAvailableItem() };
  });
}

export const dynamic = "force-dynamic";
