"use client";

import { CloseIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Creating a poll.
 *
 * A question and fixed options, nothing else. Activating this one closes the
 * previous poll: a single question at a time keeps the home page honest.
 */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

export function PollForm() {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);

  const filled = options.map((option) => option.trim()).filter(Boolean);
  const ready = question.trim().length > 1 && filled.length >= MIN_OPTIONS;

  function setOption(index: number, value: string) {
    setOptions((previous) =>
      previous.map((option, i) => (i === index ? value : option)),
    );
  }

  function removeOption(index: number) {
    setOptions((previous) => previous.filter((_, i) => i !== index));
  }

  async function submit(active: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, options: filled, active }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setQuestion("");
      setOptions(["", ""]);
      toast.success(t("admin.polls.created"));
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) void submit(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.polls.new")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="poll-question">{t("admin.polls.question")}</Label>
            <Input
              id="poll-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm leading-none font-medium">
              {t("admin.polls.options")}
            </legend>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={option}
                  aria-label={`${t("admin.polls.options")} ${index + 1}`}
                  onChange={(event) => setOption(index, event.target.value)}
                />
                {options.length > MIN_OPTIONS ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("common.delete")} ${index + 1}`}
                    onClick={() => removeOption(index)}
                  >
                    <CloseIcon />
                  </Button>
                ) : null}
              </div>
            ))}
            {options.length < MAX_OPTIONS ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOptions((previous) => [...previous, ""])}
              >
                {t("admin.polls.addOption")}
              </Button>
            ) : null}
          </fieldset>

          <div className="flex gap-2">
            <Button type="submit" disabled={!ready || busy}>
              {t("admin.polls.activate")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!ready || busy}
              onClick={() => void submit(false)}
            >
              {t("admin.announcements.draft")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
