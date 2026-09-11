import Link from "next/link";

import { AccountMenu, SignInButton } from "@/components/account-menu";
import { UmbraWordmark } from "@/components/brand";
import { CommandPalette } from "@/components/command-palette";
import { MainNav } from "@/components/main-nav";
import { NotificationBell } from "@/components/notification-bell";
import { OpenPlex } from "@/components/open-plex";
import { currentAccount } from "@/lib/auth/session";
import { unreadCount } from "@/lib/domain/notifications";
import { getLocaleOverride, getTranslator } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * One row, 64px, at every width.
 *
 * The member nav sits in it from the large breakpoint and moves to the tab
 * bar at the foot of the screen below that, so the header never grows a
 * second row: a sticky band is paid for on every screen of every page, and on
 * a phone it was a quarter of the glass. The row clears the notch on a phone
 * that has one, which is what `--umbra-sticky-top` accounts for.
 *
 * `full` lets it run to the edges instead of into the reading column. The site
 * is read, so it is kept narrow; the workspace is worked in, where a table and
 * a map want the whole desk and the header has to line up with them.
 */
export async function SiteHeader({ full = false }: { full?: boolean } = {}) {
  const [account, t, localeOverride] = await Promise.all([
    currentAccount(),
    getTranslator(),
    getLocaleOverride(),
  ]);
  // The link to the workspace is for anyone who has one: the administrator and
  // the assistants they named.
  const isStaff = account !== null && account.role !== "member";

  // Rendered with the page rather than polled: the count is true on arrival and
  // catches up on the next navigation, which is enough for a bell.
  const unread = account ? await unreadCount(account.id) : 0;

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
      <div
        className={cn(
          "flex h-16 items-center justify-between gap-2 sm:gap-4",
          full ? "w-full px-4 sm:px-6 lg:px-8" : "umbra-container",
        )}
      >
        <Link
          href="/"
          className="focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-3"
        >
          {/* On a phone the mark stands alone: the row carries the words
              "search" and "Plex" beside their icons, and the lockup's two lines
              are the one thing on it that the hero says again below. */}
          <UmbraWordmark forLabel={t("brand.for")} compact markOnlyBelowSm />
        </Link>

        <div className="hidden lg:block">
          <MainNav isStaff={isStaff} />
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {account ? (
            <>
              {/* Search lives here, one keystroke from every page: checking
                  whether a title is already on the server is the thing members
                  do most, and it should not need a destination. It is also the
                  only palette on the page: the home hero carries a field that
                  opens this one. */}
              <CommandPalette />
              <OpenPlex />
              <NotificationBell unread={unread} />
              <AccountMenu
                username={account.username}
                role={account.role}
                localeOverride={localeOverride}
              />
            </>
          ) : (
            <SignInButton />
          )}
        </div>
      </div>
    </header>
  );
}
