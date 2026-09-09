import { GoalIcon } from "@/components/icons";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { FundingView } from "@/lib/domain/funding";
import { formatAmount } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

/**
 * Funding goal.
 *
 * Umbra never takes a payment: this is a number the administrator keeps up to
 * date. The note under the bar makes it explicit that taking part buys nothing.
 */
export async function FundingCard({ goal }: { goal: FundingView | null }) {
  const { t, locale } = await getI18n();
  if (!goal) return null;

  const percent = Math.round(goal.progress * 100);
  const reached = goal.currentAmountCents >= goal.targetAmountCents;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
            <GoalIcon />
          </span>
          <span className="truncate">{goal.title}</span>
        </CardTitle>
        <CardAction className="text-sm font-medium tabular-nums">
          {reached
            ? t("funding.reached")
            : t("funding.progress", { percent: `${percent}%` })}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={percent} aria-label={goal.title} />
        <p className="text-muted-foreground text-sm tabular-nums">
          {formatAmount(goal.currentAmountCents, goal.currency, locale)}
          {" / "}
          {formatAmount(goal.targetAmountCents, goal.currency, locale)}
        </p>
        {goal.description ? (
          <p className="text-sm">{goal.description}</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {reached ? t("funding.thanks") : t("funding.note")}
        </p>
      </CardContent>
    </Card>
  );
}
