import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CastRail } from "@/components/cast-rail";
import { Shelf } from "@/components/shelf";
import { ShelfSkeleton } from "@/components/skeletons";
import { TitleDock } from "@/components/title-dock";
import { TitleView } from "@/components/title-view";
import { currentAccount, requireMemberPage } from "@/lib/auth/session";
import {
  type CatalogResult,
  decorate,
  titleDetail,
  titlePlexLinks,
} from "@/lib/domain/catalog";
import { sagaShelf } from "@/lib/domain/collections";
import { moreFrom, titleCrew, type PersonCard } from "@/lib/domain/people";
import { similarTitles } from "@/lib/domain/similar";
import { getI18n } from "@/lib/i18n/server";
import type { CollectionRef } from "@/lib/providers/metadata";

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
 * once ten seasons have made the scroll long, a dock at the bottom carrying
 * the way back, the way to Plex and the way up.
 *
 * The credits are asked for alongside the title, so the byline and the cast
 * cost no extra wait. The saga, the other work of whoever signs it and the
 * similar titles are further questions, asked once those are answered, so they
 * stream in under the title rather than holding it back.
 */
export default async function TitlePage({
  params,
}: PageProps<"/title/[kind]/[id]">) {
  const account = await requireMemberPage();
  const { kind, id } = await params;
  if (kind !== "movie" && kind !== "tv") notFound();
  if (!/^\d+$/.test(id)) notFound();

  const { locale } = await getI18n();
  const [detail, crew, plexLinks] = await Promise.all([
    titleDetail(kind, id, locale),
    titleCrew(kind, id, locale),
    titlePlexLinks(kind, id),
  ]);
  const signer = crew.leads[0];

  return (
    <div className="umbra-container max-w-6xl space-y-6 py-8 sm:py-12">
      <TitleDock title={detail.title} plex={plexLinks} fallback="/discover" />
      <div className="space-y-10 sm:space-y-12">
        <TitleView detail={detail} leads={crew.leads} accountId={account.id} />
        <CastRail cast={crew.cast} />
        {detail.collection ? (
          <Suspense fallback={<ShelfSkeleton />}>
            <Saga collection={detail.collection} locale={locale} />
          </Suspense>
        ) : null}
        {signer ? (
          <Suspense fallback={<ShelfSkeleton />}>
            <MoreFrom
              person={signer}
              kind={kind}
              id={id}
              locale={locale}
              collection={detail.collection}
            />
          </Suspense>
        ) : null}
        <Suspense fallback={<ShelfSkeleton />}>
          <Similar
            kind={kind}
            id={id}
            locale={locale}
            collection={detail.collection}
          />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The whole saga, so a missing part is seen beside the ones that are here
 * rather than found out one search at a time. Named as the provider names it.
 */
async function Saga({
  collection,
  locale,
}: {
  collection: CollectionRef;
  locale: string;
}) {
  return (
    <Shelf
      title={collection.name}
      items={await sagaShelf(collection.collectionId, locale)}
    />
  );
}

/**
 * The saga has a shelf of its own, so the shelves under it leave its parts
 * out: two rails opening on the same two sequels read as one list printed
 * twice. `sagaShelf` is memoised per request, so asking again costs nothing.
 */
async function withoutSaga(
  items: CatalogResult[],
  collection: CollectionRef | null | undefined,
  locale: string,
): Promise<CatalogResult[]> {
  if (!collection) return items;
  const saga = await sagaShelf(collection.collectionId, locale);
  const parts = new Set(saga.map((item) => `${item.kind}:${item.providerId}`));
  return items.filter((item) => !parts.has(`${item.kind}:${item.providerId}`));
}

async function MoreFrom({
  person,
  kind,
  id,
  locale,
  collection,
}: {
  person: PersonCard;
  kind: "movie" | "tv";
  id: string;
  locale: string;
  collection?: CollectionRef | null;
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
      items={await withoutSaga(titles, collection, locale)}
    />
  );
}

async function Similar({
  kind,
  id,
  locale,
  collection,
}: {
  kind: "movie" | "tv";
  id: string;
  locale: string;
  collection?: CollectionRef | null;
}) {
  const { t } = await getI18n();
  const similar = await similarTitles(kind, id, locale)
    .then(decorate)
    .catch(() => []);

  return (
    <Shelf
      title={t("title.similar")}
      items={await withoutSaga(similar, collection, locale)}
    />
  );
}
