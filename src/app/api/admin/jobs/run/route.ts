import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { runSyncCycle } from "@/lib/jobs";

/** Runs a sync cycle on demand, from the admin jobs panel. */
export async function POST() {
  return route(async () => {
    await requireAdmin();
    return { outcomes: await runSyncCycle() };
  });
}

export const maxDuration = 300;
