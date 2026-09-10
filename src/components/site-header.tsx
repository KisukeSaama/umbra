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
 * `narrow` drops the second row that carries the member nav on a phone.
 *
 * The workspace has its own navigation and its own way back to the site, so
 * that row would be a second menu over the first. It also makes the header
 * exactly 64px tall at every width there, which is what lets the section bar
 * under it stick to a fixed offset instead of guessing at one.
 *
 * `full` lets it run to the edges instead of into the reading column. The site
 * is read, so it is kept narrow; the workspace is worked in, where a table and
 * a map want the whole desk and the header has to line up with them.
 *
 * `minimal` leaves the wordmark and the account menu and nothing else, for the
 * screen an account that is not approved lands on. Everything else in here is
 * for a member: the nav links all lead back to that same screen, the palette
 * searches a route the visitor cannot open, and the bell holds a stream the
 * guard refuses. A header of doors that are all locked is worse than no header.
 */
export async function SiteHeader({
  narrow = false,
  full = false,
  minimal = false,
}: { narrow?: boolean; full?: boolean; minimal?: boolean } = {}) {
  const [account, t, localeOverride] = await Promise.all([
    currentAccount(),
    getTranslator(),
    getLocaleOverride(),
  ]);
  // The link to the workspace is for anyone who has one: the administrator and
  // the assistants they named.
  const isStaff = account !== null && account.role !== "member";

  // Rendered with the page rather than polled: the count is true on arrival and
  // catches up on the next navigation, which is enough for a bell. There is no
  // bell on the minimal header, so it is not even asked for.
  const unread = account && !minimal ? await unreadCount(account.id) : 0;

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div
        className={cn(
          "flex h-16 items-center justify-between gap-4",
          full ? "w-full px-4 sm:px-6 lg:px-8" : "umbra-container",
        )}
      >
        <Link
          href="/"
          className="focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-3"
        >
          <UmbraWordmark forLabel={t("brand.for")} compact />
        </Link>

        {minimal ? null : (
          <div className="hidden md:block">
            <MainNav isStaff={isStaff} />
          </div>
        )}

        <div className="flex items-center gap-1">
          {account ? (
            <>
              {/* Search lives here now, one keystroke from every page: checking
                  whether a title is already on the server is the thing members
                  do most, and it should not need a destination. It is also the
                  only palette on the page: the home hero carries a field that
                  opens this one. */}
              {minimal ? null : (
                <>
                  <CommandPalette />
                  <OpenPlex />
                  <NotificationBell unread={unread} />
                </>
              )}
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

      {/* On a phone the nav sits under the brand rather than being folded into a
          burger: one tap is better than two. It scrolls sideways when the
          administrator's fifth entry does not fit, rather than being clipped. */}
      {narrow || minimal ? null : (
        <div className="umbra-container flex overflow-x-auto pb-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto shrink-0">
            <MainNav isStaff={isStaff} />
          </div>
        </div>
      )}
    </header>
  );
}
