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
import { storageOutlook } from "@/lib/domain/storage";
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
      inProgressRequests(6),
      activePoll(account?.id),
      // With the reader, so the thumbs on the home card show what they pressed
      // on the feed: read anonymously, the card forgot their reaction.
      latestAnnouncement(account.id),
      storageOutlook(),
      weeklyStats(),
    ]);

  const aside = inProgress.length > 0 || poll !== null;

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

        {/* Two rows cut on the same line: a wide card that is read, then a
            narrow one that is glanced at. The week and the announcement take
            two thirds, what is coming and the storage the last one, so the
            columns meet from one row to the next instead of floating past
            each other. Nothing is stretched to a neighbour's height, and a
            side with nothing in it gives its third back to the week. */}
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
            <div className={aside ? "lg:col-span-2" : "lg:col-span-3"}>
              <Suspense fallback={<CardSkeleton lines={5} />}>
                <ThisWeek accountId={account.id} locale={locale} />
              </Suspense>
            </div>
            {aside ? (
              <div className="space-y-6">
                <InProgressRequests requests={inProgress} />
                {poll ? (
                  <PollCard poll={poll} daysLeft={daysUntil(poll.endsAt)} />
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
            <AnnouncementCard
              announcement={announcement}
              className="lg:col-span-2"
            />
            <StorageCard storage={storage} />
          </div>
        </div>
      </div>
    </>
  );
}

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
