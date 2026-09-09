import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pendingAccountCount } from "@/lib/domain/accounts";
import { countRequestsByStatus } from "@/lib/domain/requests";
import { listOpenEpisodeTasks } from "@/lib/domain/series";
import { activePoll } from "@/lib/domain/polls";
import { storageOverview } from "@/lib/domain/storage";
import { formatDateTime } from "@/lib/format";
import { jobStatus } from "@/lib/jobs";
import { getI18n } from "@/lib/i18n/server";

/**
 * The inbox.
 *
 * What is waiting for a decision, and nothing else. Counters that nobody acts
 * on belong on the analytics page, not here.
 */
export default async function AdminOverviewPage() {
  const { t, locale } = await getI18n();
  const [requests, tasks, poll, pendingAccounts, storage, jobs] =
    await Promise.all([
      countRequestsByStatus(),
      listOpenEpisodeTasks(),
      activePoll(),
      pendingAccountCount(),
      storageOverview(),
      jobStatus(),
    ]);

  const todo = [
    requests.requested > 0
      ? {
          href: "/admin/requests",
          label: t("admin.inbox.requests", { count: requests.requested }),
        }
      : null,
    tasks.length > 0
      ? {
          href: "/admin/series",
          label: t("admin.inbox.episodes", { count: tasks.length }),
        }
      : null,
    poll
      ? { href: "/admin/polls", label: t("admin.inbox.polls", { count: 1 }) }
      : null,
    pendingAccounts > 0
      ? {
          href: "/admin/accounts",
          label: t("admin.inbox.accounts", { count: pendingAccounts }),
        }
      : null,
  ].filter((entry): entry is { href: string; label: string } => entry !== null);

  const lastSync = jobs
    .map((job) => job.lastSuccessAt)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.inbox")}</CardTitle>
        </CardHeader>
        <CardContent>
          {todo.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("admin.inbox.clear")}
            </p>
          ) : (
            <ul className="space-y-1">
              {todo.map((entry) => (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    className="hover:bg-secondary/60 focus-visible:ring-ring/50 -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3"
                  >
                    <span
                      className="bg-primary size-1.5 rounded-full"
                      aria-hidden
                    />
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Two glances, not three cards: the numbers that are decisions live in
          the inbox above, and these are the only ones left worth a look. */}
      <dl className="text-muted-foreground flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <dt>{t("section.storage")}</dt>
          <dd className="text-foreground tabular-nums">
            {storage
              ? t("storage.used", {
                  percent: `${Math.round(storage.usedRatio * 100)}%`,
                })
              : t("storage.unknown")}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt>{t("admin.jobs.lastSuccess")}</dt>
          <dd>
            <Link
              href="/admin/jobs"
              className="text-foreground hover:text-primary focus-visible:ring-ring/50 rounded-md tabular-nums transition-colors outline-none focus-visible:ring-3"
            >
              {lastSync
                ? formatDateTime(lastSync, locale)
                : t("admin.jobs.never")}
            </Link>
          </dd>
        </div>
      </dl>
    </>
  );
}
