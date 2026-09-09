"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", key: "admin.nav.overview" },
  { href: "/admin/requests", key: "admin.nav.requests" },
  { href: "/admin/series", key: "admin.nav.series" },
  { href: "/admin/announcements", key: "admin.nav.announcements" },
  { href: "/admin/polls", key: "admin.nav.polls" },
  { href: "/admin/storage", key: "admin.nav.storage" },
  { href: "/admin/funding", key: "admin.nav.funding" },
  { href: "/admin/accounts", key: "admin.nav.accounts" },
  { href: "/admin/jobs", key: "admin.nav.jobs" },
] as const;

export function AdminNav() {
  const t = useTranslator();
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
      {LINKS.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
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
