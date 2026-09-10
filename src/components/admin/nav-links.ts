import {
  AccountsIcon,
  AnnounceIcon,
  DashboardIcon,
  DiskIcon,
  FlagIcon,
  RequestIcon,
  SeriesIcon,
  SyncIcon,
  type IconProps,
} from "@/components/icons";
import type { ComponentType } from "react";

import type { AdminCounts } from "@/lib/domain/admin";
import type { TranslationKey } from "@/lib/i18n";

/**
 * The workspace, in one list.
 *
 * The sidebar, the mobile drawer and the page heading all read from here, so a
 * section is named, described and counted in a single place and the three can
 * never disagree about what the administrator is looking at.
 *
 * Three groups, in the order a day tends to go: what is waiting on a decision,
 * what is said to the community, and what the machine is doing.
 */

export type AdminGroup = "work" | "community" | "server";

export type AdminLink = {
  href: string;
  key: TranslationKey;
  hint: TranslationKey;
  icon: ComponentType<IconProps>;
  group: AdminGroup;
  /** Which figure sits at the end of the row, if any. */
  count?: keyof AdminCounts;
  /** A count worth an alarm rather than a tally. */
  alarming?: boolean;
  adminOnly?: boolean;
};

export const ADMIN_GROUPS: { group: AdminGroup; key: TranslationKey }[] = [
  { group: "work", key: "admin.nav.group.work" },
  { group: "community", key: "admin.nav.group.community" },
  { group: "server", key: "admin.nav.group.server" },
];

export const ADMIN_LINKS: AdminLink[] = [
  {
    href: "/admin",
    key: "admin.nav.dashboard",
    hint: "admin.nav.dashboard.hint",
    icon: DashboardIcon,
    group: "work",
  },
  {
    href: "/admin/requests",
    key: "admin.nav.requests",
    hint: "admin.nav.requests.hint",
    icon: RequestIcon,
    group: "work",
    count: "requests",
  },
  {
    href: "/admin/reports",
    key: "admin.nav.reports",
    hint: "admin.nav.reports.hint",
    icon: FlagIcon,
    group: "work",
    count: "reports",
  },
  {
    href: "/admin/series",
    key: "admin.nav.series",
    hint: "admin.nav.series.hint",
    icon: SeriesIcon,
    group: "work",
    count: "episodes",
  },
  {
    href: "/admin/announcements",
    key: "admin.nav.announcements",
    hint: "admin.nav.announcements.hint",
    icon: AnnounceIcon,
    group: "community",
    count: "drafts",
  },
  {
    href: "/admin/accounts",
    key: "admin.nav.accounts",
    hint: "admin.nav.accounts.hint",
    icon: AccountsIcon,
    group: "community",
  },
  {
    href: "/admin/storage",
    key: "admin.nav.storage",
    hint: "admin.nav.storage.hint",
    icon: DiskIcon,
    group: "server",
  },
  {
    href: "/admin/sync",
    key: "admin.nav.sync",
    hint: "admin.nav.sync.hint",
    icon: SyncIcon,
    group: "server",
    count: "failingJobs",
    alarming: true,
  },
];

/** The dashboard owns only its own address; every other section owns its tree. */
export function isCurrent(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function currentLink(pathname: string): AdminLink {
  const matches = ADMIN_LINKS.filter((link) => isCurrent(link.href, pathname));
  // The longest match wins, so a future `/admin/series/123` still reads as the
  // series section rather than as the dashboard.
  return (
    matches.sort((a, b) => b.href.length - a.href.length)[0] ?? ADMIN_LINKS[0]
  );
}
