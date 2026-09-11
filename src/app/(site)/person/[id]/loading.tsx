import { BackLink } from "@/components/back-link";
import {
  LoadingRegion,
  PersonSkeleton,
  ShelfSkeleton,
} from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/** A person reached by their address, before the provider has answered. */
export default async function PersonLoading() {
  const t = await getTranslator();

  return (
    <div className="umbra-container max-w-6xl space-y-6 py-8 sm:py-12">
      <BackLink fallback="/discover" />
      <LoadingRegion
        label={t("common.loading")}
        className="space-y-10 sm:space-y-12"
      >
        <PersonSkeleton />
        <ShelfSkeleton />
        <ShelfSkeleton />
      </LoadingRegion>
    </div>
  );
}
