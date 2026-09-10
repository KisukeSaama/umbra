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
            empty list stays a short card rather than a tall blank one. What
            the staff took up joins the first row only when there is some. */}
        <div className="space-y-6">
          <div
            className={`grid gap-6 lg:items-start ${
              inProgress.length > 0 ? "lg:grid-cols-3" : "lg:grid-cols-2"
            }`}
          >
            <Suspense fallback={<CardSkeleton lines={5} />}>
              <ThisWeek accountId={account.id} locale={locale} />
            </Suspense>
            <InProgressRequests requests={inProgress} />
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
