import { notFound } from "next/navigation";

import { Shelf } from "@/components/shelf";
import { TitleView } from "@/components/title-view";
import { requireMemberPage } from "@/lib/auth/session";
import { decorate, titleDetail } from "@/lib/domain/catalog";
import { getI18n } from "@/lib/i18n/server";
import { tmdbProvider } from "@/lib/providers/tmdb";

/**
 * A title on its own page.
 *
 * Reached from a shelf it opens as a panel over what you were reading, and
 * reached from a link it renders here in full. Same route either way, so it can
 * be shared and it comes back through history like any other page.
 */
export default async function TitlePage({
  params,
}: PageProps<"/title/[kind]/[id]">) {
  await requireMemberPage();
  const { kind, id } = await params;
  if (kind !== "movie" && kind !== "tv") notFound();
  if (!/^\d+$/.test(id)) notFound();

  const { t, locale } = await getI18n();
  const detail = await titleDetail(kind, id, locale);

  const similar = await tmdbProvider
    .recommendations(kind, id, locale)
    .then(decorate)
    .catch(() => []);

  return (
    <div className="umbra-container max-w-4xl space-y-12 py-10">
      <TitleView detail={detail} />
      <Shelf title={t("title.similar")} items={similar} />
    </div>
  );
}
