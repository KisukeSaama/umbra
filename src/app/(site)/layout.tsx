import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireMemberPage } from "@/lib/auth/session";

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

  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
