import Link from "next/link";

import { AccountMenu, SignInButton } from "@/components/account-menu";
import { UmbraWordmark } from "@/components/brand";
import { MainNav } from "@/components/main-nav";
import { currentAccount } from "@/lib/auth/session";
import { getLocaleOverride, getTranslator } from "@/lib/i18n/server";

export async function SiteHeader() {
  const [account, t, localeOverride] = await Promise.all([
    currentAccount(),
    getTranslator(),
    getLocaleOverride(),
  ]);
  const isAdmin = account?.role === "admin";

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="umbra-container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-3"
        >
          <UmbraWordmark forLabel={t("brand.for")} compact />
        </Link>

        <div className="hidden md:block">
          <MainNav isAdmin={isAdmin} />
        </div>

        <div className="flex items-center gap-2">
          {account ? (
            <AccountMenu
              username={account.username}
              isAdmin={isAdmin}
              localeOverride={localeOverride}
            />
          ) : (
            <SignInButton />
          )}
        </div>
      </div>

      {/* On a phone the nav sits under the brand rather than being folded into a
          burger: one tap is better than two. It scrolls sideways when the
          administrator's fifth entry does not fit, rather than being clipped. */}
      <div className="umbra-container flex overflow-x-auto pb-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto shrink-0">
          <MainNav isAdmin={isAdmin} />
        </div>
      </div>
    </header>
  );
}
