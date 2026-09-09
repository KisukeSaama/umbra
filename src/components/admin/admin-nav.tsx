"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", key: "admin.today" },
  { href: "/admin/requests", key: "admin.nav.requests" },
  { href: "/admin/reports", key: "admin.nav.reports" },
  { href: "/admin/series", key: "admin.nav.series" },
  { href: "/admin/announcements", key: "admin.nav.announcements" },
  { href: "/admin/polls", key: "admin.nav.polls" },
  { href: "/admin/storage", key: "admin.nav.storage" },
  { href: "/admin/funding", key: "admin.nav.funding" },
  { href: "/admin/accounts", key: "admin.nav.accounts", adminOnly: true },
  { href: "/admin/jobs", key: "admin.nav.jobs" },
] as const;

function isCurrent(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/**
 * The assistants share this workspace, minus what hands out access: the
 * accounts page belongs to the administrator alone, so it is not offered here.
 * Hiding is a courtesy, not the guard: the page and the route check for
 * themselves.
 */
export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslator();
  const pathname = usePathname();
  const links = LINKS.filter((link) => isAdmin || !("adminOnly" in link));

  return (
    <nav
      aria-label={t("admin.title")}
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {links.map((link) => {
        const active = isCurrent(link.href, pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/50 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
              active
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The page title, named after the section rather than the whole area: on a
 * phone the active nav item can be scrolled out of view, and the heading is
 * what tells you where you are. The member pages use the same shape, an
 * eyebrow and a serif line.
 */
export function AdminHeading() {
  const t = useTranslator();
  const pathname = usePathname();
  const current =
    LINKS.find((link) => isCurrent(link.href, pathname)) ?? LINKS[0];

  return (
    <div className="mb-8">
      <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
        {t("admin.title")}
      </p>
      <h1 className="mt-1 text-3xl tracking-tight sm:text-4xl">
        {t(current.key)}
      </h1>
    </div>
  );
}
