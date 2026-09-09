import type { Metadata } from "next";

import { SearchPanel } from "@/components/search-panel";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Request" };

export default async function RequestPage({
  searchParams,
}: PageProps<"/request">) {
  const t = await getTranslator();
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q : "";

  return (
    <div className="umbra-container max-w-3xl py-12">
      <h1 className="text-3xl tracking-tight sm:text-4xl">
        {t("search.title")}
      </h1>
      <p className="text-muted-foreground mt-1 mb-8">{t("search.subtitle")}</p>
      <SearchPanel initialQuery={initialQuery} />
    </div>
  );
}
