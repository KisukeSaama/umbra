import { route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { ConflictError } from "@/lib/errors";
import { anyJobRunning, runSyncCycle } from "@/lib/jobs";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Runs a sync cycle now, from the synchronisation page.
 *
 * Started rather than awaited, for the same reason as the disk walk: a full
 * cycle is minutes of work, and holding the request open for it puts the truth
 * of "is it still going" in a browser tab instead of in `job_run`, where the
 * page can read it however it was opened.
 */
export async function POST() {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(5));

    // A second cycle would fight the first for the same library and the same
    // rows. The scheduled route asks the same question and skips its turn.
    if (await anyJobRunning()) throw new ConflictError("error.syncRunning");

    // Deliberately not awaited: the runs are the record, not the response.
    void runSyncCycle().catch((error) => {
      console.error("[jobs] cycle failed", error);
    });

    return { started: true };
  });
}
