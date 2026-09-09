import { FundingForm } from "@/components/admin/funding-form";
import { FundingPanel } from "@/components/admin/funding-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { goalHistory, listGoals } from "@/lib/domain/funding";
import { formatAmount, formatDateTime } from "@/lib/format";
import { requireAdminPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

/**
 * Funding, administrator side.
 *
 * One active goal, its manual adjustments, and the history those adjustments
 * leave behind. No payment provider is involved anywhere in this page.
 */
export default async function AdminFundingPage() {
  await requireAdminPage();
  const { t, locale } = await getI18n();
  const goals = await listGoals();
  const active =
    goals.find((goal) => goal.status === "active") ?? goals[0] ?? null;
  const history = active ? await goalHistory(active.id) : [];

  return (
    <>
      {active ? <FundingPanel goal={active} /> : null}
      {active?.status === "active" ? null : <FundingForm />}

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.funding.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border/60 -my-2 divide-y text-sm">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <span className="text-muted-foreground min-w-0 truncate">
                    <time
                      dateTime={entry.createdAt.toISOString()}
                      className="tabular-nums"
                    >
                      {formatDateTime(entry.createdAt, locale)}
                    </time>
                    {entry.note ? ` · ${entry.note}` : ""}
                  </span>
                  <span
                    className={
                      entry.deltaCents < 0
                        ? "text-destructive shrink-0 tabular-nums"
                        : "text-primary shrink-0 tabular-nums"
                    }
                  >
                    {entry.deltaCents > 0 ? "+" : ""}
                    {formatAmount(
                      entry.deltaCents,
                      active?.currency ?? "EUR",
                      locale,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
