import type { MonthlyStats } from "@/lib/domain/analytics";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Aggregated figures for the last 30 days. Nothing here can be traced back to
 * a person, by construction: the underlying counters have no account column.
 *
 * The period is written above the figures rather than left to the labels: a
 * bare "3 new titles" reads as a total, and the reader has no way to tell.
 */
export async function MonthStats({ stats }: { stats: MonthlyStats }) {
  const t = await getTranslator();
  const entries = [
    { value: stats.newContent, label: t("stats.newContent") },
    { value: stats.requestsHandled, label: t("stats.requestsHandled") },
    { value: stats.newEpisodes, label: t("stats.newEpisodes") },
  ];

  if (entries.every((entry) => entry.value === 0)) return null;

  return (
    <section aria-labelledby="month-stats-title" className="space-y-2">
      <h2
        id="month-stats-title"
        className="text-muted-foreground text-xs font-medium"
      >
        {t("section.last30Days")}
      </h2>
      <ul className="border-border/60 divide-border/60 grid grid-cols-3 divide-x rounded-xl border">
        {entries.map((entry) => (
          <li key={entry.label} className="px-4 py-3 text-center">
            <p className="text-xl font-semibold tabular-nums sm:text-2xl">
              {entry.value}
            </p>
            <p className="text-muted-foreground text-xs">{entry.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
