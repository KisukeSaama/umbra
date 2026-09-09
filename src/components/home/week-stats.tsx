import type { WeeklyStats } from "@/lib/domain/analytics";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Aggregated weekly figures. Nothing here can be traced back to a person, by
 * construction: the underlying counters have no account column.
 */
export async function WeekStats({ stats }: { stats: WeeklyStats }) {
  const t = await getTranslator();
  const entries = [
    { value: stats.newContent, label: t("stats.newContent") },
    { value: stats.requestsHandled, label: t("stats.requestsHandled") },
    { value: stats.newEpisodes, label: t("stats.newEpisodes") },
  ];

  if (entries.every((entry) => entry.value === 0)) return null;

  return (
    <section aria-label={t("section.thisWeek")}>
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
