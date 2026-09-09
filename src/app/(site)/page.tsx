import { UmbraFigure } from "@/components/brand";
import { AnnouncementCard } from "@/components/home/announcement-card";
import { FundingCard } from "@/components/home/funding-card";
import { HeroSearch } from "@/components/home/hero-search";
import { RecentlyAdded } from "@/components/home/recently-added";
import { StorageCard } from "@/components/home/storage-card";
import { UpcomingEpisodes } from "@/components/home/upcoming";
import { WeekStats } from "@/components/home/week-stats";
import { PollCard } from "@/components/poll-card";
import { requireMemberPage } from "@/lib/auth/session";
import { weeklyStats } from "@/lib/domain/analytics";
import { latestAnnouncement } from "@/lib/domain/announcements";
import { activeGoal } from "@/lib/domain/funding";
import { recentlyAdded } from "@/lib/domain/library";
import { activePoll } from "@/lib/domain/polls";
import { upcomingEpisodes } from "@/lib/domain/series";
import { storageOverview } from "@/lib/domain/storage";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The home page answers, in one screen: what is new, what is coming, what the
 * community is deciding, and how the server is doing.
 */
export default async function HomePage() {
  const account = await requireMemberPage();
  const t = await getTranslator();

  const [recent, upcoming, poll, announcement, storage, goal, stats] =
    await Promise.all([
      recentlyAdded(12),
      upcomingEpisodes(5),
      activePoll(account?.id),
      latestAnnouncement(),
      storageOverview(),
      activeGoal(),
      weeklyStats(),
    ]);

  return (
    <>
      <section className="umbra-glow border-border/60 border-b">
        <div className="umbra-container flex flex-col items-center py-16 text-center sm:py-24">
          {/* The messenger opens the page, then gets out of the way of the one
              input that matters. */}
          <UmbraFigure
            alt={t("brand.alt")}
            preload
            sizes="(min-width: 640px) 9rem, 7rem"
            className="mb-6 w-28 sm:w-36"
          />
          <p className="text-muted-foreground text-sm">{t("home.greeting")}</p>
          <h1 className="mt-3 mb-9 text-4xl tracking-tight text-balance sm:text-6xl">
            {t("home.title")}
          </h1>
          <HeroSearch />
        </div>
      </section>

      <div className="umbra-container space-y-12 py-12">
        <WeekStats stats={stats} />
        <RecentlyAdded items={recent} />

        {/* Two rows of like with like: the two lists that can run long, then
            the three glances. Nothing is stretched to a neighbour's height, so
            an empty list stays a short card rather than a tall blank one. */}
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <UpcomingEpisodes episodes={upcoming} />
            <PollCard poll={poll} />
          </div>
          <div className="grid gap-6 md:grid-cols-3 md:items-start">
            <AnnouncementCard announcement={announcement} />
            <StorageCard storage={storage} />
            <FundingCard goal={goal} />
          </div>
        </div>
      </div>
    </>
  );
}
