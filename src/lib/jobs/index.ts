import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { jobRuns, jobState } from "@/lib/db/schema";
import { enrichLibraryPosters, syncLibrary } from "@/lib/domain/library";
import { purgeNotifications } from "@/lib/domain/notifications";
import {
  closeReportsSolvedByCalendar,
  closeReportsSolvedByLibrary,
  notifyResolvedReports,
} from "@/lib/domain/reports";
import {
  closeRequestsPresentInLibrary,
  notifyArrivedRequests,
} from "@/lib/domain/requests";
import {
  linkSeriesToLibrary,
  reconcileEpisodes,
  seriesDueForSync,
  syncSeriesEpisodes,
} from "@/lib/domain/series";
import { recordStorageSnapshot, scanStorageTree } from "@/lib/domain/storage";
import { accountsForTaste, refreshTasteProfile } from "@/lib/domain/taste";

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
  "storage-scan",
  "taste-profile",
  "housekeeping",
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

/** A disk walk is worth doing four times a day, not forty-eight. */
const SCAN_INTERVAL_HOURS = 6;

/**
 * Has enough time passed since this job last succeeded?
 *
 * The question is asked of the clock rather than of a schedule, so a step that
 * was skipped for two days runs on the next pass instead of waiting for a slot
 * that was missed.
 */
async function due(job: JobName, hours: number): Promise<boolean> {
  const [state] = await db()
    .select({ lastSuccessAt: jobState.lastSuccessAt })
    .from(jobState)
    .where(eq(jobState.jobName, job))
    .limit(1);
  if (!state?.lastSuccessAt) return true;
  return Date.now() - state.lastSuccessAt.getTime() >= hours * 3_600_000;
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
      await notifyArrivedRequests();
      // A missing episode is answered by the index, so this is the pass that
      // can watch it arrive.
      await closeReportsSolvedByLibrary();
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
      // Season and series reports read the calendar, so they can only settle
      // once reconciliation has just refreshed it.
      await closeReportsSolvedByCalendar();
      await notifyResolvedReports();
      return result.tasksOpened;
    }),
  );

  outcomes.push(
    await runJob("storage-snapshot", async () => {
      const snapshot = await recordStorageSnapshot();
      return snapshot ? 1 : 0;
    }),
  );

  /*
   * What fills the disk.
   *
   * Walking the volumes costs minutes, and the answer moves by the day rather
   * than by the half hour, so the step is due on a clock of its own. It is a
   * date compared against now like everything else here: a week of downtime
   * costs one late walk, not seven.
   */
  outcomes.push(
    await runJob("storage-scan", async () => {
      if (!(await due("storage-scan", SCAN_INTERVAL_HOURS))) return 0;
      const tree = await scanStorageTree();
      return tree?.fileCount ?? 0;
    }),
  );

  /*
   * Taste profiles.
   *
   * Rebuilt from a rolling window on every run rather than accumulated, and
   * skipped entirely for anyone who turned personalisation off. One account
   * failing does not stop the others: a profile is a nicety, not a record.
   */
  outcomes.push(
    await runJob("taste-profile", async () => {
      const people = await accountsForTaste();
      let refreshed = 0;
      for (const person of people) {
        try {
          await refreshTasteProfile(person);
          refreshed += 1;
        } catch (error) {
          console.warn("[jobs] taste profile skipped", error);
        }
      }
      return refreshed;
    }),
  );

  /*
   * Housekeeping.
   *
   * Everything that grows without bound, and nothing else. It has its own step
   * so a failed deletion shows up as a failed deletion, instead of hiding
   * inside a run that was about something entirely different.
   */
  outcomes.push(
    await runJob("housekeeping", async () => {
      let removed = await purgeNotifications();
      removed += await purgeExpired();
      return removed;
    }),
  );

  return outcomes;
}

/**
 * Rows nothing else ever deletes.
 *
 * Sessions and pins expire but were never swept, and the run history grew
 * forever. Bounded by date rather than by a cursor, so a long backlog drains
 * over successive runs and a missed schedule costs nothing.
 */
async function purgeExpired(): Promise<number> {
  const statements = [
    sql`DELETE FROM session WHERE expires_at < now()`,
    sql`DELETE FROM auth_pin WHERE expires_at < now() OR consumed_at IS NOT NULL`,
    sql`DELETE FROM job_run WHERE started_at < now() - interval '30 days'`,
    /*
     * Disk maps are large and only the latest is ever read. A week of them is
     * kept so a scan that went wrong can be compared against the one before,
     * and the newest is never swept whatever its age: a server that was down
     * for a month must still have a map to draw when it comes back.
     */
    sql`DELETE FROM storage_tree_snapshot
        WHERE scanned_at < now() - interval '7 days'
          AND id <> (SELECT id FROM storage_tree_snapshot ORDER BY scanned_at DESC LIMIT 1)`,
  ];

  let removed = 0;
  for (const statement of statements) {
    const result = await db().execute(statement);
    removed += result.count ?? 0;
  }
  return removed;
}

export type JobStatusRow = {
  jobName: JobName;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastRunAt: Date | null;
  lastError: string | null;
  /** How long the last run took, in milliseconds, when it finished. */
  lastDurationMs: number | null;
  /** What the last run went through: titles, episodes, files, rows deleted. */
  lastItems: number | null;
};

/** What the synchronisation page shows. */
export async function jobStatus(): Promise<JobStatusRow[]> {
  const states = await db().select().from(jobState);
  const lastRuns = await db()
    .select({
      jobName: jobRuns.jobName,
      status: jobRuns.status,
      startedAt: jobRuns.startedAt,
      finishedAt: jobRuns.finishedAt,
      itemsProcessed: jobRuns.itemsProcessed,
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
      lastDurationMs:
        run?.finishedAt && run.startedAt
          ? run.finishedAt.getTime() - run.startedAt.getTime()
          : null,
      lastItems: run?.itemsProcessed ?? null,
    };
  });
}
