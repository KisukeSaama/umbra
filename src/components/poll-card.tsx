"use client";

import { useState } from "react";
import { toast } from "sonner";

import { EmptyNote } from "@/components/empty-note";
import { PollIcon } from "@/components/icons";
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
 * Results only show once you have voted, so the standings do not steer the
 * vote. A closed poll shows them to everyone: there is no vote left to steer.
 *
 * A vote can be moved as long as the question is open. Changing your mind is
 * part of a decision, and the tally counts people, not clicks.
 *
 * `bare` drops the card around it, for the news feed, where the question is
 * part of the announcement that carries it and a card inside a card would say
 * they were two separate things.
 */
export function PollCard({
  poll: initialPoll,
  bare = false,
}: {
  poll: PollView | null;
  bare?: boolean;
}) {
  const t = useTranslator();
  const locale = useLocale();

  const [poll, setPoll] = useState(initialPoll);
  const [selected, setSelected] = useState<string | null>(
    initialPoll?.votedOptionId ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  if (!poll) {
    if (bare) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("section.poll")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyNote icon={PollIcon}>{t("poll.none")}</EmptyNote>
        </CardContent>
      </Card>
    );
  }

  const hasVoted = poll.votedOptionId !== null;
  const closed = poll.closed;
  const showResults = hasVoted || closed;
  const canChange = hasVoted && selected !== poll.votedOptionId;
  // The split is only revealed in motion when the vote just landed here; a
  // poll already voted on an earlier visit is simply read.
  const justVoted = poll !== initialPoll;
  const timeLeft = daysLeftLabel(poll, t);

  async function vote() {
    if (!poll || !selected || closed) return;
    if (poll.votedOptionId === selected) return;
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

      const next = body.poll as PollView;
      setPoll(next);
      setSelected(next.votedOptionId);
      toast.success(t(hasVoted ? "poll.voteChanged" : "poll.voted"));
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

  const question = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{poll.question}</p>
        {timeLeft && bare ? (
          <span
            className={cn(
              "text-xs",
              closed
                ? "text-foreground/80 font-medium"
                : "text-muted-foreground",
            )}
          >
            {timeLeft}
          </span>
        ) : null}
      </div>

      {/* Once the question is closed, the options stop being controls: the
            split is what is left to read, and it must stay readable, not
            greyed out. While it is open, a vote already cast can still move. */}
      <div
        className="space-y-1"
        role="radiogroup"
        aria-label={poll.question}
        aria-disabled={closed || undefined}
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
              disabled={closed || submitting}
              onClick={() => setSelected(option.id)}
              className={cn(
                "focus-visible:ring-ring/50 w-full rounded-lg px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3",
                closed
                  ? "cursor-default"
                  : "hover:bg-secondary/60 active:bg-secondary",
                chosen && !closed ? "bg-secondary/60" : "",
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
                {showResults ? (
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {share}%
                  </span>
                ) : null}
              </span>

              {showResults ? (
                <span className="bg-secondary mt-2 block h-1.5 overflow-hidden rounded-full">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      justVoted && "umbra-fill",
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
        {/* A closed question already says so next to the question itself. */}
        {closed ? null : hasVoted && !canChange ? (
          <span className="text-primary text-sm">{t("poll.voted")}</span>
        ) : (
          <Button
            onClick={() => void vote()}
            disabled={!selected || submitting}
          >
            {t(hasVoted ? "poll.changeVote" : "poll.vote")}
          </Button>
        )}
      </div>
    </>
  );

  if (bare)
    return (
      <div className="border-border/60 space-y-4 rounded-xl border p-4">
        {question}
      </div>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("section.poll")}</CardTitle>
        {timeLeft ? (
          <CardAction className="text-muted-foreground text-xs">
            {timeLeft}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">{question}</CardContent>
    </Card>
  );
}

function daysLeftLabel(poll: PollView, t: ReturnType<typeof useTranslator>) {
  if (poll.closed) return t("poll.closed");
  if (!poll.endsAt) return "";
  const days = Math.ceil(
    (new Date(poll.endsAt).getTime() - Date.now()) / 86_400_000,
  );
  if (days <= 0) return t("poll.closed");
  if (days === 1) return t("poll.endsToday");
  return t("poll.daysLeft", { count: days });
}
