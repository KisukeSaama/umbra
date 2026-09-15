import type { Metadata } from "next";

import { SearchSitePanel } from "@/components/admin/search-site-panel";
import { requireStaffPage } from "@/lib/auth/session";
import { listSearchSites } from "@/lib/domain/search-sites";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.searchSites") }) };
}

/**
 * Where the search pages are written down.
 *
 * Configuration and nothing else: Umbra never opens these pages itself, it
 * builds the link the requests and the reports carry.
 */
export default async function AdminSearchSitesPage() {
  await requireStaffPage();
  return <SearchSitePanel sites={await listSearchSites()} />;
}
