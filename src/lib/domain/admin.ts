import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { announcements, episodeTasks, jobRuns } from "@/lib/db/schema";
import { pendingAccountCount } from "@/lib/domain/accounts";
import { countOpenReports } from "@/lib/domain/reports";
import { countLiveRequests } from "@/lib/domain/requests";

/**
 * What the workspace shows on its own navigation.
 *
 * A count next to a section is the difference between a menu and a desk: it is
 * what tells the administrator where the work is before they open anything.
 * Every figure here is a count, never a page of rows, so carrying it on every
 * screen costs one cheap query each.
 */

export type AdminCounts = {
  /** Requests still on the desk, taken in hand ones included. */
  requests: number;
  reports: number;
  episodes: number;
  drafts: number;
  accounts: number;
  /** Steps whose most recent run failed. Zero is the ordinary state. */
  failingJobs: number;
};

export async function adminCounts(isAdmin: boolean): Promise<AdminCounts> {
  const [requests, reports, episodes, drafts, accounts, failingJobs] =
    await Promise.all([
      countLiveRequests(),
      countOpenReports(),
      openEpisodeTaskCount(),
      draftAnnouncementCount(),
      // Accounts belong to the administrator alone, so an assistant is never
      // shown a number for a door they cannot open.
      isAdmin ? pendingAccountCount() : Promise.resolve(0),
      failingJobCount(),
    ]);

  return {
    requests,
    reports,
    episodes,
    drafts,
    accounts,
    failingJobs,
  };
}

export async function openEpisodeTaskCount(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(episodeTasks)
    .where(eq(episodeTasks.status, "open"));
  return row?.count ?? 0;
}

export async function draftAnnouncementCount(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(announcements)
    .where(eq(announcements.published, false));
  return row?.count ?? 0;
}

/**
 * Steps whose last attempt failed.
 *
 * Only the most recent run of each step counts: a failure three days ago that
 * has been succeeding since is history, not a thing to badge.
 */
async function failingJobCount(): Promise<number> {
  const latest = db()
    .select({
      jobName: jobRuns.jobName,
      status: jobRuns.status,
      rank: sql<number>`row_number() OVER (PARTITION BY ${jobRuns.jobName} ORDER BY ${jobRuns.startedAt} DESC)`.as(
        "rank",
      ),
    })
    .from(jobRuns)
    .as("latest");

  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(latest)
    .where(and(eq(latest.rank, 1), eq(latest.status, "failure")));
  return row?.count ?? 0;
}
