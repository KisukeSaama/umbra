import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { jobRuns, jobState } from "@/lib/db/schema";
import { enrichLibraryPosters, syncLibrary } from "@/lib/domain/library";
import { closeRequestsPresentInLibrary } from "@/lib/domain/requests";
import {
  linkSeriesToLibrary,
  notifyOpenEpisodeTasks,
  reconcileEpisodes,
  seriesDueForSync,
  syncSeriesEpisodes,
} from "@/lib/domain/series";
import { recordStorageSnapshot } from "@/lib/domain/storage";

/**
 * Scheduled work.
 *
 * Every job is idempotent and observable: it records a run, and on success it
 * stamps `job_state.last_success_at`. Nothing depends on being run at a precise
 * moment, so a missed schedule is caught up by the next pass rather than lost
 * (see `docs/architecture.md`).
 */

export const JOB_NAMES = [
  "library-sync",
  "series-sync",
  "episode-reconcile",
  "storage-snapshot",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export type JobOutcome = { job: JobName; items: number; error?: string };

async function runJob(
  job: JobName,
  work: () => Promise<number>,
): Promise<JobOutcome> {
  const [run] = await db()
    .insert(jobRuns)
    .values({ jobName: job })
    .returning({ id: jobRuns.id });

  try {
    const items = await work();
    await db()
      .update(jobRuns)
      .set({ status: "success", finishedAt: new Date(), itemsProcessed: items })
      .where(eq(jobRuns.id, run.id));
    await db()
      .insert(jobState)
      .values({ jobName: job, lastSuccessAt: new Date() })
      .onConflictDoUpdate({
        target: jobState.jobName,
        set: { lastSuccessAt: new Date() },
      });

    return { job, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[jobs] ${job} failed`, error);
    await db()
      .update(jobRuns)
      .set({
        status: "failure",
        finishedAt: new Date(),
        error: message.slice(0, 500),
      })
      .where(eq(jobRuns.id, run.id));

    return { job, items: 0, error: message };
  }
}

/**
 * One full cycle, in dependency order.
 *
 * A failing step does not stop the others: a metadata provider being down must
 * not prevent the storage snapshot from being recorded.
 */
export async function runSyncCycle(): Promise<JobOutcome[]> {
  const outcomes: JobOutcome[] = [];

  outcomes.push(
    await runJob("library-sync", async () => {
      const { items, episodes } = await syncLibrary();
      await linkSeriesToLibrary();
      await closeRequestsPresentInLibrary();
      await enrichLibraryPosters();
      return items + episodes;
    }),
  );

  outcomes.push(
    await runJob("series-sync", async () => {
      const due = await seriesDueForSync();
      let synced = 0;
      for (const series of due) {
        synced += await syncSeriesEpisodes(series.id, series.providerId);
      }
      return synced;
    }),
  );

  outcomes.push(
    await runJob("episode-reconcile", async () => {
      const result = await reconcileEpisodes();
      await notifyOpenEpisodeTasks();
      return result.tasksOpened;
    }),
  );

  outcomes.push(
    await runJob("storage-snapshot", async () => {
      const snapshot = await recordStorageSnapshot();
      return snapshot ? 1 : 0;
    }),
  );

  return outcomes;
}

export type JobStatusRow = {
  jobName: string;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastRunAt: Date | null;
  lastError: string | null;
};

/** What the admin observability panel shows. */
export async function jobStatus(): Promise<JobStatusRow[]> {
  const states = await db().select().from(jobState);
  const lastRuns = await db()
    .select({
      jobName: jobRuns.jobName,
      status: jobRuns.status,
      startedAt: jobRuns.startedAt,
      error: jobRuns.error,
      rank: sql<number>`row_number() OVER (PARTITION BY ${jobRuns.jobName} ORDER BY ${jobRuns.startedAt} DESC)`,
    })
    .from(jobRuns)
    .orderBy(desc(jobRuns.startedAt))
    .limit(50);

  return JOB_NAMES.map((jobName) => {
    const state = states.find((row) => row.jobName === jobName);
    const run = lastRuns.find((row) => row.jobName === jobName);
    return {
      jobName,
      lastSuccessAt: state?.lastSuccessAt ?? null,
      lastStatus: run?.status ?? null,
      lastRunAt: run?.startedAt ?? null,
      lastError: run?.error ?? null,
    };
  });
}
