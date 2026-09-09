import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireMemberPage } from "@/lib/auth/session";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Umbra is private: everything under this layout needs an approved account.
 *
 * The check here is the first line, not the only one. A layout does not stop
 * the page under it from rendering and is not re-run on every navigation, so
 * each page calls the same guard for itself. An account that is not approved
 * is sent to its own screen, `/pending`.
 */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  await requireMemberPage();
  const t = await getTranslator();

  return (
    <>
      <a href="#content" className="umbra-skip">
        {t("common.skipToContent")}
      </a>
      <SiteHeader />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
