import { route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { ConflictError } from "@/lib/errors";
import { runningJob, runStorageScan } from "@/lib/jobs";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Measures the disk now.
 *
 * The scheduled pass walks the volumes a few times a day, which is the right
 * cadence for a number that moves with what arrives. This is the button for the
 * moment after a large deletion, when waiting six hours to see the result is
 * the wrong answer.
 *
 * The walk takes minutes, so the request does not wait for it. It starts the
 * step and returns, and the step records itself in `job_run` like every other
 * one: the page can then say a measurement is under way whoever loads it and
 * whenever, instead of that fact living in the button somebody pressed before
 * navigating somewhere else.
 */
export async function POST() {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(5));

    // One walk at a time. Two would read the same disk twice, fight for the
    // same input and write two snapshots of the same moment.
    if (await runningJob("storage-scan"))
      throw new ConflictError("error.scanRunning");

    // Deliberately not awaited: the run is the record, not the response.
    void runStorageScan().catch((error) => {
      console.error("[storage] scan failed", error);
    });

    return { started: true };
  });
}

/**
 * Where the walk is, polled by the page while it runs.
 *
 * Polled every two seconds, so its quota is the reading kind rather than the
 * writing kind: the cap is there to stop a loop, not to count glances.
 */
export async function GET() {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin-read", account.id, perMinute(120));
    const running = await runningJob("storage-scan");
    return {
      running: running !== null,
      startedAt: running?.startedAt ?? null,
      progress: running?.progress ?? null,
    };
  });
}
