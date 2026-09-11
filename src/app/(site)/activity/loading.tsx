import {
  LoadingRegion,
  PageHeaderSkeleton,
  TextLine,
  TitleRowSkeleton,
} from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/** The follow-up page before its two lists: requests, then reports. */
export default async function ActivityLoading() {
  const t = await getTranslator();

  return (
    <LoadingRegion
      label={t("common.loading")}
      className="umbra-container space-y-10 py-8 sm:space-y-12 sm:py-12"
    >
      <PageHeaderSkeleton />

      <div>
        <TextLine size="h2" className="mb-4 w-40" />
        <div className="space-y-3">
          <TitleRowSkeleton />
          <TitleRowSkeleton />
        </div>
      </div>

      <div>
        <TextLine size="h2" className="mb-4 w-40" />
        <div className="space-y-3">
          <TitleRowSkeleton />
        </div>
      </div>
    </LoadingRegion>
  );
}
