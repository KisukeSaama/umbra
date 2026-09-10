import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { BackToTop } from "@/components/back-to-top";
import { CastRail } from "@/components/cast-rail";
import { ExternalLinkIcon } from "@/components/icons";
import { PlexLink } from "@/components/open-plex";
import { Shelf } from "@/components/shelf";
import { ShelfSkeleton } from "@/components/skeletons";
import { TitleView } from "@/components/title-view";
import { buttonVariants } from "@/components/ui/button";
import { currentAccount, requireMemberPage } from "@/lib/auth/session";
import { decorate, titleDetail, titlePlexLinks } from "@/lib/domain/catalog";
import { moreFrom, titleCrew, type PersonCard } from "@/lib/domain/people";
import { getI18n } from "@/lib/i18n/server";
import { tmdbProvider } from "@/lib/providers/tmdb";

/**
 * The tab carries the title, which is the one page here with a name of its own
 * to give. `titleDetail` is memoised per request, so asking for it twice, once
 * for the head and once for the body, is one call to the provider.
 *
 * The account is checked here as well as in the page: this runs alongside it,
 * not after it, and a visitor being sent to the sign-in screen must not have
 * spent a call on the provider on the way.
 */
export async function generateMetadata({
  params,
}: PageProps<"/title/[kind]/[id]">): Promise<Metadata> {
  const account = await currentAccount();
  if (!account) return {};

  const { kind, id } = await params;
  if ((kind !== "movie" && kind !== "tv") || !/^\d+$/.test(id)) return {};

  const { locale } = await getI18n();
  const detail = await titleDetail(kind, id, locale).catch(() => null);
  return detail ? { title: detail.title } : {};
}

/**
 * A title on its own page.
 *
 * A title is a page and not a modal: it can be shared, opened in a tab and
 * come back through history like anything else on the web. What a modal would
 * have given it is drawn instead, which is what `docs/DESIGN.md` asks for and
 * what the loading state already promised: the way back at the top left, and
 * the way up at the bottom right once ten seasons have made the scroll long.
 *
 * The credits are asked for alongside the title, so the byline and the cast
 * cost no extra wait. The other work of whoever signs it and the similar
 * titles are further questions, asked once those are answered, so they stream
 * in under the title rather than holding it back.
 */
export default async function TitlePage({
  params,
}: PageProps<"/title/[kind]/[id]">) {
  const account = await requireMemberPage();
  const { kind, id } = await params;
  if (kind !== "movie" && kind !== "tv") notFound();
  if (!/^\d+$/.test(id)) notFound();

  const { locale, t } = await getI18n();
  const [detail, crew, plexLinks] = await Promise.all([
    titleDetail(kind, id, locale),
    titleCrew(kind, id, locale),
    titlePlexLinks(kind, id),
  ]);
  const signer = crew.leads[0];

  return (
    <div className="umbra-container max-w-6xl space-y-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <BackLink fallback="/discover" />
        {plexLinks ? (
          <PlexLink
            web={plexLinks.web}
            app={plexLinks.app}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("title.openPlex")}
            <ExternalLinkIcon />
          </PlexLink>
        ) : null}
      </div>
      <div className="space-y-12">
        <TitleView detail={detail} leads={crew.leads} accountId={account.id} />
        <CastRail cast={crew.cast} />
        {signer ? (
          <Suspense fallback={<ShelfSkeleton />}>
            <MoreFrom person={signer} kind={kind} id={id} locale={locale} />
          </Suspense>
        ) : null}
        <Suspense fallback={<ShelfSkeleton />}>
          <Similar kind={kind} id={id} locale={locale} />
        </Suspense>
      </div>
      <BackToTop />
    </div>
  );
}

async function MoreFrom({
  person,
  kind,
  id,
  locale,
}: {
  person: PersonCard;
  kind: "movie" | "tv";
  id: string;
  locale: string;
}) {
  const { t } = await getI18n();
  const titles = await moreFrom(
    person.personId,
    { kind, providerId: id },
    locale,
  ).catch(() => []);

  return (
    <Shelf
      title={t("title.moreFrom", { name: person.name })}
      href={`/person/${person.personId}`}
      items={titles}
    />
  );
}

async function Similar({
  kind,
  id,
  locale,
}: {
  kind: "movie" | "tv";
  id: string;
  locale: string;
}) {
  const { t } = await getI18n();
  const similar = await tmdbProvider
    .recommendations(kind, id, locale)
    .then(decorate)
    .catch(() => []);

  return <Shelf title={t("title.similar")} items={similar} />;
}
