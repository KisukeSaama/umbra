import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { safeEquals } from "@/lib/auth/compare";
import { env } from "@/lib/env";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { anyJobRunning, runSyncCycle } from "@/lib/jobs";
import { checkRate, clientAddress, perMinute } from "@/lib/rate-limit";

/**
 * Scheduled synchronisation.
 *
 * Called by the worker container (or any scheduler) with the shared secret.
 * Nothing here depends on being called at a precise time: a missed run is
 * caught up by the next one.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    // The worker calls this every half hour from inside the network, so the
    // quota is generous; what it stops is somebody outside trying secrets
    // against it, which the reverse proxy should already be refusing.
    checkRate("cron", clientAddress(request.headers), perMinute(10));
    checkRate("cron", "all", perMinute(30));

    const secret = env().CRON_SECRET;
    if (!secret) throw new NotFoundError();

    const provided = request.headers
      .get("authorization")
      ?.replace(/^Bearer /i, "");
    if (!provided || !safeEquals(provided, secret))
      throw new UnauthorizedError();

    // A cycle already on its feet, started by hand or by a worker that ran
    // long, is left to finish. Skipping costs one interval; two cycles over
    // the same library cost a fight over the same rows. This is the cheap
    // answer, not the guard: each step is held by a unique index on its own
    // running row, so a cycle that starts here anyway still cannot double up.
    if (await anyJobRunning()) return { skipped: true, outcomes: [] };

    return { outcomes: await runSyncCycle() };
  });
}

export const dynamic = "force-dynamic";
/*
 * The cycle is awaited inside the request, and the caller's own timeout is what
 * bounds it: the worker waits fifteen minutes and then gives up on the answer
 * while the server carries on, and the next call is skipped rather than laid
 * over the first. There is no route-level limit to set here, since `maxDuration`
 * is read by a platform this application is not deployed on.
 */
