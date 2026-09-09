import type { Metadata } from "next";
import { Suspense } from "react";

import { MoodPicker } from "@/components/mood-picker";
import { Shelf } from "@/components/shelf";
import { Skeleton } from "@/components/ui/skeleton";
import { requireMemberPage } from "@/lib/auth/session";
import {
  airingShelf,
  becauseYouAsked,
  forYouShelf,
  trendingShelf,
  upcomingShelf,
} from "@/lib/domain/discovery";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Discover" };

/**
 * The cosy half of Umbra.
 *
 * Shelves for browsing without a question in mind, and a guided picker for the
 * evenings where even a shelf is too much. Every card carries its state, so
 * "is this already here" is answered by looking rather than by searching.
 *
 * Each shelf streams on its own. That is not a performance trick: the gateway
 * can refuse one listing and this way it costs a rail rather than the page.
 */
export default async function DiscoverPage() {
  const account = await requireMemberPage();
  const { t, locale } = await getI18n();

  return (
    <div className="umbra-container space-y-14 py-10">
      <header>
        <h1 className="text-3xl tracking-tight sm:text-4xl">
          {t("discover.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("discover.subtitle")}</p>
      </header>

      <section className="border-border/60 bg-card/40 rounded-xl border p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">
          {t("picker.title")}
        </h2>
        <p className="text-muted-foreground mb-5 text-sm">{t("picker.open")}</p>
        <MoodPicker />
      </section>

      <Suspense fallback={<ShelfSkeleton />}>
        <ForYou accountId={account.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<ShelfSkeleton />}>
        <Trending locale={locale} />
      </Suspense>

      <Suspense fallback={<ShelfSkeleton />}>
        <FromYourRequests accountId={account.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<ShelfSkeleton />}>
        <Airing locale={locale} />
      </Suspense>

      <Suspense fallback={<ShelfSkeleton />}>
        <Upcoming locale={locale} />
      </Suspense>
    </div>
  );
}

async function ForYou({
  accountId,
  locale,
}: {
  accountId: string;
  locale: string;
}) {
  const { t } = await getI18n();
  return (
    <Shelf
      title={t("section.forYou")}
      items={await forYouShelf(accountId, locale)}
    />
  );
}

async function Trending({ locale }: { locale: string }) {
  const { t } = await getI18n();
  return (
    <Shelf
      title={t("section.trending")}
      items={await trendingShelf(locale)}
      delayMs={40}
      priority
    />
  );
}

async function FromYourRequests({
  accountId,
  locale,
}: {
  accountId: string;
  locale: string;
}) {
  const { t } = await getI18n();
  const shelf = await becauseYouAsked(accountId, locale);
  if (!shelf) return null;
  return (
    <Shelf
      title={t("section.becauseYouAsked", { title: shelf.seed })}
      items={shelf.items}
      delayMs={80}
    />
  );
}

async function Airing({ locale }: { locale: string }) {
  const { t } = await getI18n();
  return (
    <Shelf
      title={t("section.airing")}
      items={await airingShelf(locale)}
      delayMs={120}
    />
  );
}

async function Upcoming({ locale }: { locale: string }) {
  const { t } = await getI18n();
  return (
    <Shelf
      title={t("section.upcoming")}
      items={await upcomingShelf(locale)}
      delayMs={160}
    />
  );
}

/** Shaped like the shelf that is coming, never a spinner parked on a page. */
function ShelfSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="w-32 shrink-0 space-y-2 sm:w-36">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
