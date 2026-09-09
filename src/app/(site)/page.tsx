import { Suspense } from "react";

import { AnnouncementCard } from "@/components/home/announcement-card";
import { FundingCard } from "@/components/home/funding-card";
import { Hero } from "@/components/home/hero";
import { RecentlyAdded } from "@/components/home/recently-added";
import { StorageCard } from "@/components/home/storage-card";
import { UpcomingEpisodes } from "@/components/home/upcoming";
import { WeekStats } from "@/components/home/week-stats";
import { PollCard } from "@/components/poll-card";
import { Shelf } from "@/components/shelf";
import { requireMemberPage } from "@/lib/auth/session";
import { weeklyStats } from "@/lib/domain/analytics";
import { latestAnnouncement } from "@/lib/domain/announcements";
import { trendingShelf } from "@/lib/domain/discovery";
import { activeGoal } from "@/lib/domain/funding";
import { recentlyAdded } from "@/lib/domain/library";
import { activePoll } from "@/lib/domain/polls";
import { upcomingEpisodes } from "@/lib/domain/series";
import { storageOverview } from "@/lib/domain/storage";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

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

  const [recent, upcoming, poll, announcement, storage, goal, stats] =
    await Promise.all([
      recentlyAdded(14),
      upcomingEpisodes(5),
      activePoll(account?.id),
      latestAnnouncement(),
      storageOverview(),
      activeGoal(),
      weeklyStats(),
    ]);

  return (
    <>
      <Hero posters={recent} />

      <div className="umbra-container space-y-12 py-12">
        <WeekStats stats={stats} />
        <RecentlyAdded items={recent} />

        {/* One shelf from the wider world on the home page, and only one: the
            rest of that lives on its own page, which is where you go when you
            came without an idea. A refused listing costs this rail alone. */}
        <Suspense fallback={null}>
          <TrendingRail locale={locale} />
        </Suspense>

        {/* Two rows of like with like: the two lists that can run long, then
            the glances. Nothing is stretched to a neighbour's height, so an
            empty list stays a short card rather than a tall blank one. The
            second row counts what it actually has: with no funding goal the
            three columns become two, rather than leaving a hole on the right. */}
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <UpcomingEpisodes episodes={upcoming} />
            <PollCard poll={poll} />
          </div>
          <div
            className={cn(
              "grid gap-6 md:items-start",
              goal ? "md:grid-cols-3" : "lg:grid-cols-2",
            )}
          >
            <AnnouncementCard announcement={announcement} />
            <StorageCard storage={storage} />
            {goal ? <FundingCard goal={goal} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

async function TrendingRail({ locale }: { locale: string }) {
  const { t } = await getI18n();
  return (
    <Shelf
      title={t("section.trending")}
      items={await trendingShelf(locale)}
      href="/discover"
    />
  );
}
