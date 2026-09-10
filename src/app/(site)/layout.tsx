import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TabBar } from "@/components/tab-bar";
import { requireMemberPage } from "@/lib/auth/session";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Umbra is private: everything under this layout needs a member's session,
 * which only somebody the server is shared with is ever handed.
 *
 * The check here is the first line, not the only one. A layout does not stop
 * the page under it from rendering and is not re-run on every navigation, so
 * each page calls the same guard for itself.
 */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const account = await requireMemberPage();
  const t = await getTranslator();

  return (
    <>
      <a href="#content" className="umbra-skip">
        {t("common.skipToContent")}
      </a>
      <SiteHeader />
      <main id="content" className="group/main relative flex-1">
        {/*
         * The weather, shared by every screen.
         *
         * The home page used to be the only one with a sky behind it, so every
         * move away from it swapped an atmosphere for flat paper and read as a
         * jump between two sites. The same glow now sits at the top of every
         * page, barely lit, and the sticky header keeps one tint under it
         * wherever you land: going home changes how bright the top of the page
         * is, not whether it is there at all.
         *
         * The hero brings its own, stronger sky, so the band steps aside on the
         * one page that already has one rather than adding a second copy of the
         * same gradient at a slightly different height.
         */}
        <div
          className="umbra-glow umbra-dawn pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem] group-has-[[data-umbra-hero]]/main:hidden"
          aria-hidden
        />
        {children}
      </main>
      <SiteFooter />
      {/* Room for the tab bar, which floats over the foot of the page on a
          phone: without it the credits end under the bar. Zero elsewhere. */}
      <div className="h-(--umbra-tabbar) shrink-0" aria-hidden />
      <TabBar isStaff={account.role !== "member"} />
    </>
  );
}
