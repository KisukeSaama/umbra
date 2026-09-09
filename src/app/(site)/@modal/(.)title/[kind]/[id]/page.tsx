import { notFound } from "next/navigation";

import { TitleModal } from "@/components/title-modal";
import { TitleView } from "@/components/title-view";
import { requireMemberPage } from "@/lib/auth/session";
import { titleDetail } from "@/lib/domain/catalog";
import { getI18n } from "@/lib/i18n/server";

/**
 * The same title, seen without leaving the shelf.
 *
 * This is the interception: a click inside the site opens the panel, a shared
 * link opens the page. The guard is repeated here because a layout above does
 * not stop this from rendering.
 */
export default async function InterceptedTitlePage({
  params,
}: PageProps<"/title/[kind]/[id]">) {
  await requireMemberPage();
  const { kind, id } = await params;
  if (kind !== "movie" && kind !== "tv") notFound();
  if (!/^\d+$/.test(id)) notFound();

  const { locale } = await getI18n();
  const detail = await titleDetail(kind, id, locale);

  return (
    <TitleModal title={detail.title}>
      <TitleView detail={detail} />
    </TitleModal>
  );
}
