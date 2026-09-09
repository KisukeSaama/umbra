"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PollView } from "@/lib/domain/polls";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * A poll: pick one option, vote, see the split. No comments and no free text,
 * which is exactly why this needs no moderation.
 *
 * Results only show once you have voted, so the standings do not steer the vote.
 */
export function PollCard({ poll: initialPoll }: { poll: PollView | null }) {
  const t = useTranslator();
  const locale = useLocale();

  const [poll, setPoll] = useState(initialPoll);
  const [selected, setSelected] = useState<string | null>(
    initialPoll?.votedOptionId ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  if (!poll) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{t("section.poll")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t("poll.none")}</p>
        </CardContent>
      </Card>
    );
  }

  const hasVoted = poll.votedOptionId !== null;
  const timeLeft = daysLeftLabel(poll, t);

  async function vote() {
    if (!poll || !selected || hasVoted) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: selected }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setPoll(body.poll as PollView);
      toast.success(t("poll.voted"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("section.poll")}</CardTitle>
        {timeLeft ? (
          <CardAction className="text-muted-foreground text-xs">
            {timeLeft}
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="font-medium">{poll.question}</p>

        {/* Once the vote is in, the options stop being controls: the split is
            what is left to read, and it must stay readable, not greyed out. */}
        <div
          className="space-y-1"
          role="radiogroup"
          aria-label={poll.question}
          aria-disabled={hasVoted || undefined}
        >
          {poll.options.map((option) => {
            const chosen = selected === option.id;
            const isOwnVote = poll.votedOptionId === option.id;
            const share = Math.round(option.share * 100);
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={hasVoted || submitting}
                onClick={() => setSelected(option.id)}
                className={cn(
                  "focus-visible:ring-ring/50 w-full rounded-lg px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3",
                  hasVoted
                    ? "cursor-default"
                    : "hover:bg-secondary/60 active:bg-secondary",
                  chosen && !hasVoted ? "bg-secondary/60" : "",
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                      chosen || isOwnVote
                        ? "border-primary"
                        : "border-muted-foreground/50",
                    )}
                  >
                    {chosen || isOwnVote ? (
                      <span className="bg-primary size-2 rounded-full" />
                    ) : null}
                  </span>
                  <span className="flex-1 text-sm">{option.label}</span>
                  {hasVoted ? (
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {share}%
                    </span>
                  ) : null}
                </span>

                {hasVoted ? (
                  <span className="bg-secondary mt-2 block h-1.5 overflow-hidden rounded-full">
                    <span
                      className={cn(
                        "block h-full rounded-full transition-[width] duration-700 ease-out",
                        isOwnVote ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                      style={{ width: `${share}%` }}
                    />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("poll.votes", { count: poll.totalVotes })}
          </span>
          {hasVoted ? (
            <span className="text-primary text-sm">{t("poll.voted")}</span>
          ) : (
            <Button
              onClick={() => void vote()}
              disabled={!selected || submitting}
            >
              {t("poll.vote")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function daysLeftLabel(poll: PollView, t: ReturnType<typeof useTranslator>) {
  if (!poll.endsAt) return "";
  const days = Math.ceil(
    (new Date(poll.endsAt).getTime() - Date.now()) / 86_400_000,
  );
  if (days <= 0) return t("poll.closed");
  if (days === 1) return t("poll.endsToday");
  return t("poll.daysLeft", { count: days });
}
