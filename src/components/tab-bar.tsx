"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  AnnounceIcon,
  CompassIcon,
  DashboardIcon,
  FollowUpIcon,
  HouseIcon,
} from "@/components/icons";
import { NewsDot } from "@/components/main-nav";
import { useNewsUnread } from "@/components/news-seen";
import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The member nav on a phone: a bar of tabs at the foot of the screen.
 *
 * A second row under the header would cost a quarter of a phone screen to a
 * sticky band before a single poster was in sight, and put the four
 * destinations at the one edge a thumb does not reach. Down here the header
 * is one row and every destination is under the thumb, which is
 * where every app the members already use keeps them.
 *
 * The same four destinations as the desktop pill, in the same order, with the
 * admin entry for the staff. Active is the filled glyph, ink text and the
 * one-pixel ochre line the desktop nav draws, so the two are one nav and not
 * two. The bar is licensed to blur, since the page scrolls under it, and it
 * sets `--umbra-tabbar` on the body through the stylesheet, so the title dock
 * and the toasts step over it without being told.
 */
const TABS = [
  { href: "/", key: "nav.home", icon: HouseIcon },
  { href: "/discover", key: "nav.discover", icon: CompassIcon },
  { href: "/activity", key: "nav.activityShort", icon: FollowUpIcon },
  { href: "/news", key: "nav.news", icon: AnnounceIcon },
] as const;

export function TabBar({
  isStaff,
  newsUnread = false,
}: {
  isStaff: boolean;
  /** A note went out since this member last opened the feed. */
  newsUnread?: boolean;
}) {
  const t = useTranslator();
  const pathname = usePathname();
  const unread = useNewsUnread(newsUnread);

  const tabs = isStaff
    ? [
        ...TABS,
        { href: "/admin", key: "nav.admin", icon: DashboardIcon } as const,
      ]
    : TABS;

  return (
    <nav
      aria-label={t("nav.primary")}
      className="umbra-tabbar border-border/60 bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="flex h-14 items-stretch">
        {tabs.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 relative flex h-full flex-col items-center justify-center gap-1 px-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground active:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className="size-6"
                    weight={active ? "fill" : "light"}
                    aria-hidden
                  />
                  {tab.href === "/news" && unread ? (
                    <NewsDot className="absolute -top-0.5 -right-1 ml-0 size-2" />
                  ) : null}
                </span>
                <span className="max-w-full truncate leading-none">
                  {t(tab.key)}
                </span>
                {active ? (
                  <span
                    className="bg-primary absolute bottom-1.5 h-px w-6 rounded-full"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
