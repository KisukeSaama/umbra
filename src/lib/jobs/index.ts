import "server-only";

import { and, desc, eq, gt, sql } from "drizzle-orm";

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

/**
 * What a long step is doing right now.
 *
 * Written to `job_state.cursor`, which exists for exactly this: a place a job
 * can leave a note about where it is. It is a note, not a record, so it is
 * cleared when the step ends and it is never read for anything but display.
 */
export type JobProgress = {
  /** Whatever the step counts: files, titles, episodes. */
  items: number;
  /** Bytes seen, for the steps that measure. */
  bytes?: number;
  /** Where the step currently is, in words the operator chose. */
  where?: string;
};

/** How often a step is allowed to write down where it is. */
const PROGRESS_EVERY_MS = 1500;

/**
 * A step that has been "running" this long was interrupted.
 *
 * A process restarted mid-walk leaves a row nothing will ever finish, and that
 * row would block the next attempt forever. Bounded by the clock like
 * everything else here rather than by a heartbeat nobody sends.
 */
const STALE_AFTER_MS = 45 * 60_000;

type Report = (progress: JobProgress) => void;

async function runJob(
  job: JobName,
  work: (report: Report) => Promise<number>,
): Promise<JobOutcome> {
  const [run] = await db()
    .insert(jobRuns)
    .values({ jobName: job })
    .returning({ id: jobRuns.id });

  // Progress is written at most every second and a half, and never awaited by
  // the work itself: a step must not run at the speed of its own reporting.
  let lastWrite = 0;
  const report: Report = (progress) => {
    const now = Date.now();
    if (now - lastWrite < PROGRESS_EVERY_MS) return;
    lastWrite = now;
    void writeProgress(job, progress);
  };

  try {
    const items = await work(report);
    await db()
      .update(jobRuns)
      .set({ status: "success", finishedAt: new Date(), itemsProcessed: items })
      .where(eq(jobRuns.id, run.id));
    await db()
      .insert(jobState)
      .values({ jobName: job, lastSuccessAt: new Date(), cursor: null })
      .onConflictDoUpdate({
        target: jobState.jobName,
        set: { lastSuccessAt: new Date(), cursor: null },
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
    await writeProgress(job, null);

    return { job, items: 0, error: message };
  }
}

async function writeProgress(job: JobName, progress: JobProgress | null) {
  try {
    await db()
      .insert(jobState)
      .values({ jobName: job, cursor: progress })
      .onConflictDoUpdate({
        target: jobState.jobName,
        set: { cursor: progress },
      });
  } catch (error) {
    // A note about where the work is must never be what stops the work.
    console.warn(`[jobs] ${job} progress not written`, error);
  }
}

/**
 * Is this step running right now, and how far along?
 *
 * What the administration needs in order to say "a measurement is under way"
 * on a page the operator has just come back to, rather than in the button they
 * pressed and then navigated away from.
 */
export async function runningJob(job: JobName): Promise<{
  startedAt: Date;
  progress: JobProgress | null;
} | null> {
  const [run] = await db()
    .select({ id: jobRuns.id, startedAt: jobRuns.startedAt })
    .from(jobRuns)
    .where(and(eq(jobRuns.jobName, job), eq(jobRuns.status, "running")))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  if (!run) return null;

  if (Date.now() - run.startedAt.getTime() > STALE_AFTER_MS) {
    // Closed rather than reported: whatever was doing this is gone.
    await db()
      .update(jobRuns)
      .set({
        status: "failure",
        finishedAt: new Date(),
        error: "interrupted",
      })
      .where(eq(jobRuns.id, run.id));
    await writeProgress(job, null);
    return null;
  }

  const [state] = await db()
    .select({ cursor: jobState.cursor })
    .from(jobState)
    .where(eq(jobState.jobName, job))
    .limit(1);

  return {
    startedAt: run.startedAt,
    progress: (state?.cursor as JobProgress | null) ?? null,
  };
}

/**
 * Is any step running right now?
 *
 * Asked before starting a cycle by hand, so a second one cannot be laid over
 * the first. Runs left behind by a restart age out the same way a single step
 * does, which is what keeps a crash from blocking the button forever.
 */
export async function anyJobRunning(): Promise<boolean> {
  const stale = new Date(Date.now() - STALE_AFTER_MS);
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(jobRuns)
    .where(and(eq(jobRuns.status, "running"), gt(jobRuns.startedAt, stale)));
  return (row?.count ?? 0) > 0;
}

/**
 * The disk walk, on demand.
 *
 * Same bookkeeping as the scheduled pass, because it is the same work: it
 * records a run, so a page loaded from anywhere can see that a measurement is
 * under way, and so pressing the button twice cannot start two walks.
 */
export async function runStorageScan(): Promise<JobOutcome> {
  return runJob("storage-scan", async (report) => {
    await recordStorageSnapshot();
    const tree = await scanStorageTree(report);
    return tree?.fileCount ?? 0;
  });
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
    await runJob("storage-scan", async (report) => {
      if (!(await due("storage-scan", SCAN_INTERVAL_HOURS))) return 0;
      const tree = await scanStorageTree(report);
      return tree?.fileCount ?? 0;
    }),
  );

  /*
   * Taste profiles.
   *
   * Rebuilt from a rolling window on every run rather than accumulated. One
   * account failing does not stop the others: a profile is a nicety, not a
   * record.
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
  /** Where the step is, while it is still running. Null the rest of the time. */
  progress: JobProgress | null;
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
      // The note only means anything while the step is on its feet: a cursor
      // left behind by a run that ended is stale, not progress.
      progress:
        run?.status === "running"
          ? ((state?.cursor as JobProgress | null) ?? null)
          : null,
    };
  });
}
