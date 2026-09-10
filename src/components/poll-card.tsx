"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
import { EmptyNote } from "@/components/empty-note";
import { formatPercent } from "@/components/formatting";
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
import { useLocale, useTranslator } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n";
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
 * `bare` drops the section header around it, for the news feed, where the
 * question is part of the announcement that carries it rather than a second
 * object with a title of its own. What is left is a sheet panel inside an entry
 * that is otherwise plain text: on that page it is the one thing asking to be
 * touched, and it should look like it.
 */
export function PollCard({
  poll: serverPoll,
  daysLeft = null,
  bare = false,
}: {
  poll: PollView | null;
  /**
   * Whole days until the question closes, counted by the server, or `null` when
   * it has no end date. It is not counted here: a clock read while rendering
   * and read again while hydrating gives two different answers for the same
   * screen.
   */
  daysLeft?: number | null;
  bare?: boolean;
}) {
  const t = useTranslator();
  const locale = useLocale();

  const [poll, setPoll] = useState(serverPoll);
  const [selected, setSelected] = useState<string | null>(
    serverPoll?.votedOptionId ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  // The split is only revealed in motion when the vote just landed here; a
  // poll already voted on an earlier visit is simply read.
  const [justVoted, setJustVoted] = useState(false);
  const options = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * The poll the page came with wins over the one this card is holding.
   *
   * Anything that calls `router.refresh()`, a vote elsewhere or a notification
   * arriving, re-renders the server component above with a newer poll. Seeding
   * state from props only once meant a question closed in the administration
   * stayed open here until the tab was reloaded, and the fill animation replayed
   * on every refresh because the props no longer matched what was on screen.
   */
  const [shownFor, setShownFor] = useState(serverPoll);
  if (shownFor !== serverPoll) {
    setShownFor(serverPoll);
    setPoll(serverPoll);
    setSelected(serverPoll?.votedOptionId ?? null);
    setJustVoted(false);
  }

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
  const timeLeft = timeLeftLabel(poll, daysLeft, t);
  // One tab stop for the group, on the option that is chosen or on the first:
  // a radio group is one control, and Tab is for leaving it.
  const focused = Math.max(
    0,
    poll.options.findIndex((option) => option.id === selected),
  );

  async function vote() {
    if (!poll || !selected || closed) return;
    if (poll.votedOptionId === selected) return;
    setSubmitting(true);
    try {
      const body = await request<{ poll: PollView }>(
        `/api/polls/${poll.id}/vote`,
        { method: "POST", body: { optionId: selected } },
      );
      setPoll(body.poll);
      setSelected(body.poll.votedOptionId);
      setJustVoted(true);
      toast.success(t(hasVoted ? "poll.voteChanged" : "poll.voted"));
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Arrows walk the group and carry the choice with them, which is what a
   * radio group does everywhere else: the roles were already declared here,
   * and only Tab answered them.
   */
  function onOptionKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!poll || closed) return;
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (step === 0) return;

    event.preventDefault();
    const total = poll.options.length;
    const next = (index + step + total) % total;
    setSelected(poll.options[next].id);
    options.current[next]?.focus();
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
        {poll.options.map((option, index) => {
          const chosen = selected === option.id;
          const isOwnVote = poll.votedOptionId === option.id;
          const share = Math.round(option.share * 100);
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={index === focused ? 0 : -1}
              ref={(node) => {
                options.current[index] = node;
              }}
              disabled={closed || submitting}
              onClick={() => setSelected(option.id)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
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
                    {formatPercent(option.share, locale)}
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
      <div className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1">
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

function timeLeftLabel(
  poll: PollView,
  daysLeft: number | null,
  t: Translator,
): string {
  if (poll.closed) return t("poll.closed");
  if (daysLeft === null) return "";
  if (daysLeft <= 0) return t("poll.closed");
  if (daysLeft === 1) return t("poll.endsToday");
  return t("poll.daysLeft", { count: daysLeft });
}
