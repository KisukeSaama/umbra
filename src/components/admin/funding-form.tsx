"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/** Creating a goal. One is active at a time, so this is a rare form. */
export function FundingForm() {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const targetAmount = Number(target.replace(",", "."));
  const ready =
    title.trim().length > 1 &&
    Number.isFinite(targetAmount) &&
    targetAmount > 0;

  async function submit(active: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/funding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim() || null,
          targetAmountCents: Math.round(targetAmount * 100),
          status: active ? "active" : "draft",
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setTitle("");
      setDescription("");
      setTarget("");
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
        <CardTitle>{t("admin.funding.new")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">{t("news.title")}</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-target">{t("admin.funding.target")}</Label>
            <Input
              id="goal-target"
              inputMode="decimal"
              value={target}
              placeholder="220"
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="goal-description">
            {t("section.announcement")} ({t("common.optional")})
          </Label>
          <Textarea
            id="goal-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button disabled={!ready || busy} onClick={() => void submit(true)}>
            {t("admin.funding.activate")}
          </Button>
          <Button
            variant="secondary"
            disabled={!ready || busy}
            onClick={() => void submit(false)}
          >
            {t("admin.announcements.draft")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
