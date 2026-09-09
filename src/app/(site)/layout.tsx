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
    </>
  );
}
