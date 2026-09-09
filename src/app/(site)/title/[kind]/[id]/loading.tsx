import { BackLink } from "@/components/back-link";
import {
  LoadingRegion,
  ShelfSkeleton,
  TitleSkeleton,
} from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/**
 * A title reached by its address, before the provider has answered. The way
 * back needs no data, so it is drawn for real and works from the first paint.
 */
export default async function TitleLoading() {
  const t = await getTranslator();

  return (
    <div className="umbra-container max-w-4xl space-y-6 py-10">
      <BackLink fallback="/discover" />
      <LoadingRegion label={t("common.loading")} className="space-y-12">
        <TitleSkeleton />
        <ShelfSkeleton />
      </LoadingRegion>
    </div>
  );
}
