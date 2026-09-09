"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ActionButton } from "@/components/admin/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { FundingView } from "@/lib/domain/funding";
import { formatAmount } from "@/lib/format";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * The funding goal, from the administrator's side.
 *
 * Umbra takes no payment: this panel is where a number moves by hand, and every
 * move leaves a line in the history. Negative amounts are allowed on purpose,
 * because corrections happen.
 */
const QUICK_AMOUNTS = [5, 10, 20];

export function FundingPanel({ goal }: { goal: FundingView | null }) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!goal) return null;

  const percent = Math.round(goal.progress * 100);
  const customAmount = Number(custom.replace(",", "."));
  const customReady = Number.isFinite(customAmount) && customAmount !== 0;

  async function adjust(euros: number) {
    if (!goal || !Number.isFinite(euros) || euros === 0) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/funding/${goal.id}/transactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deltaCents: Math.round(euros * 100),
            note: note.trim() || null,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setCustom("");
      setNote("");
      toast.success(t("admin.funding.recorded"));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{goal.title}</CardTitle>
        <CardAction>
          <Badge variant={goal.status === "active" ? "default" : "outline"}>
            {t(`admin.funding.status.${goal.status}` as TranslationKey)}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <Progress value={percent} aria-label={goal.title} />
        <p className="text-muted-foreground text-sm tabular-nums">
          {formatAmount(goal.currentAmountCents, goal.currency, locale)} /{" "}
          {formatAmount(goal.targetAmountCents, goal.currency, locale)} (
          {percent}%)
        </p>

        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <Button
              key={amount}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void adjust(amount)}
            >
              + {formatAmount(amount * 100, goal.currency, locale)}
            </Button>
          ))}
        </div>

        <form
          className="grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void adjust(customAmount);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="funding-custom">{t("admin.funding.custom")}</Label>
            <Input
              id="funding-custom"
              inputMode="decimal"
              value={custom}
              placeholder="-10"
              onChange={(event) => setCustom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="funding-note">
              {t("admin.funding.note")}{" "}
              <span className="text-muted-foreground font-normal">
                ({t("common.optional")})
              </span>
            </Label>
            <Input
              id="funding-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !customReady}>
            {t("admin.funding.add")}
          </Button>
        </form>

        {goal.status !== "active" ? (
          <ActionButton
            url={`/api/admin/funding/${goal.id}`}
            body={{ status: "active" }}
            size="sm"
            variant="secondary"
          >
            {t("admin.funding.activate")}
          </ActionButton>
        ) : null}
      </CardContent>
    </Card>
  );
}
