import { Suspense } from "react";

import { AnnouncementCard } from "@/components/home/announcement-card";
import { Hero } from "@/components/home/hero";
import { InProgressRequests } from "@/components/home/in-progress-requests";
import { RecentlyAdded } from "@/components/home/recently-added";
import { StorageCard } from "@/components/home/storage-card";
import { UpcomingEpisodes } from "@/components/home/upcoming";
import { WeekStats } from "@/components/home/week-stats";
import { daysUntil } from "@/components/formatting";
import { PollCard } from "@/components/poll-card";
import { Shelf } from "@/components/shelf";
import { CardSkeleton, ShelfSkeleton } from "@/components/skeletons";
import { requireMemberPage } from "@/lib/auth/session";
import { weeklyStats } from "@/lib/domain/analytics";
import { latestAnnouncement } from "@/lib/domain/announcements";
import { trendingShelf } from "@/lib/domain/discovery";
import { recentlyAdded } from "@/lib/domain/library";
import { activePoll } from "@/lib/domain/polls";
import { inProgressRequests } from "@/lib/domain/requests";
import { upcomingEpisodes, watchingThisWeek } from "@/lib/domain/series";
import { storageOverview } from "@/lib/domain/storage";
import { getI18n } from "@/lib/i18n/server";

/**
 * The home page answers, in one screen: what is new, what is coming, what the
 * community is deciding, and how the server is doing.
 *
 * It stays deliberately uneven. A hero that changes with the week, then a rail,
 * then blocks of different sizes: a grid of identical cards would say that
 * everything here matters equally, and it does not.
 */
export default async function HomePage() {
  const account = await requireMemberPage();
  const { locale } = await getI18n();

  const [recent, inProgress, poll, announcement, storage, stats] =
    await Promise.all([
      recentlyAdded(14),
      inProgressRequests(5),
      activePoll(account?.id),
      latestAnnouncement(),
      storageOverview(),
      weeklyStats(),
    ]);

  const grid =
    GRID[1 + (inProgress.length > 0 ? 1 : 0) + (poll ? 1 : 0)] ?? GRID[1];

  return (
    <>
      <Hero posters={recent} />

      <div className="umbra-container space-y-10 py-8 sm:space-y-12 sm:py-12">
        <WeekStats stats={stats} />
        <RecentlyAdded items={recent} />

        {/* One shelf from the wider world on the home page, and only one: the
            rest of that lives on its own page, which is where you go when you
            came without an idea. A refused listing costs this rail alone. */}
        <Suspense fallback={<ShelfSkeleton />}>
          <TrendingRail locale={locale} />
        </Suspense>

        {/* Two rows of like with like: the lists that can run long, then the
            glances. Nothing is stretched to a neighbour's height, so a short
            list stays a short card rather than a tall blank one. A card with
            nothing to show leaves the row rather than holding a column for
            an empty note, and the second row takes its columns from the first
            so the two line up instead of floating past each other. */}
        <div className="space-y-6">
          <div className={`grid gap-6 lg:items-start ${grid.first}`}>
            <Suspense fallback={<CardSkeleton lines={5} />}>
              <ThisWeek accountId={account.id} locale={locale} />
            </Suspense>
            <InProgressRequests requests={inProgress} />
            {poll ? (
              <PollCard poll={poll} daysLeft={daysUntil(poll.endsAt)} />
            ) : null}
          </div>
          <div className={`grid gap-6 lg:items-start ${grid.second}`}>
            <AnnouncementCard
              announcement={announcement}
              className={grid.announcement}
            />
            <StorageCard storage={storage} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The columns of the two card rows, by how many cards the first row holds.
 *
 * The announcement takes every column but the last, so its right edge falls
 * on a line the row above already drew. With one card above there is no line
 * to meet, and the glances share the row two to one rather than stacking.
 */
const GRID: Record<
  number,
  { first: string; second: string; announcement: string }
> = {
  1: { first: "", second: "lg:grid-cols-3", announcement: "lg:col-span-2" },
  2: { first: "lg:grid-cols-2", second: "lg:grid-cols-2", announcement: "" },
  3: {
    first: "lg:grid-cols-3",
    second: "lg:grid-cols-3",
    announcement: "lg:col-span-2",
  },
};

/**
 * Smaller than the rail above it on purpose: what landed here is the reason
 * to come back, what the world is watching is a glance elsewhere, and two
 * rails of the same weight would say the two matter equally.
 */
async function TrendingRail({ locale }: { locale: string }) {
  const { t } = await getI18n();
  return (
    <Shelf
      title={t("section.trending")}
      items={await trendingShelf(locale)}
      href="/discover"
      size="compact"
    />
  );
}

/**
 * The week of what this member watches. It asks the provider about each show,
 * so it streams in on its own rather than holding the page. The history behind
 * it is read live and dropped with the render, never stored.
 */
async function ThisWeek({
  accountId,
  locale,
}: {
  accountId: string;
  locale: string;
}) {
  const watching = await watchingThisWeek(accountId, locale, 5);
  const personal = watching.length > 0;
  return (
    <UpcomingEpisodes
      episodes={personal ? watching : await upcomingEpisodes(5)}
      personal={personal}
    />
  );
}
