import { Suspense } from "react";

import { AnnouncementCard } from "@/components/home/announcement-card";
import { Hero } from "@/components/home/hero";
import { RecentlyAdded } from "@/components/home/recently-added";
import { StorageCard } from "@/components/home/storage-card";
import { UpcomingEpisodes } from "@/components/home/upcoming";
import { WeekStats } from "@/components/home/week-stats";
import { daysUntil } from "@/components/formatting";
import { PollCard } from "@/components/poll-card";
import { Shelf } from "@/components/shelf";
import { ShelfSkeleton } from "@/components/skeletons";
import { requireMemberPage } from "@/lib/auth/session";
import { weeklyStats } from "@/lib/domain/analytics";
import { latestAnnouncement } from "@/lib/domain/announcements";
import { trendingShelf } from "@/lib/domain/discovery";
import { recentlyAdded } from "@/lib/domain/library";
import { activePoll } from "@/lib/domain/polls";
import { upcomingEpisodes } from "@/lib/domain/series";
import { storageOverview } from "@/lib/domain/storage";
import { followedSeriesKeys } from "@/lib/domain/taste";
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

  const [recent, upcoming, poll, announcement, storage, stats] =
    await Promise.all([
      recentlyAdded(14),
      // The week is read through this member: the shows they are on, then the
      // rest of what is due. The history behind that is read live and dropped
      // with the render, never stored.
      followedSeriesKeys(account.id).then((keys) => upcomingEpisodes(5, keys)),
      activePoll(account?.id),
      latestAnnouncement(),
      storageOverview(),
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
        <Suspense fallback={<ShelfSkeleton />}>
          <TrendingRail locale={locale} />
        </Suspense>

        {/* Two rows of like with like: the two lists that can run long, then
            the glances. Nothing is stretched to a neighbour's height, so an
            empty list stays a short card rather than a tall blank one. */}
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <UpcomingEpisodes episodes={upcoming} />
            <PollCard poll={poll} daysLeft={daysUntil(poll?.endsAt ?? null)} />
          </div>
          <div className="grid gap-6 md:items-start lg:grid-cols-2">
            <AnnouncementCard announcement={announcement} />
            <StorageCard storage={storage} />
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
