"use client";

import { useState } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
import { ThumbsDownIcon, ThumbsUpIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ReactionValue } from "@/lib/db/schema";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import {
  applyReaction,
  nextReaction,
  type ReactionTally,
} from "@/lib/reactions";
import { cn } from "@/lib/utils";

/**
 * A thumb up and a thumb down under a note, each with its count.
 *
 * The numbers move as soon as a thumb is pressed and fall back if the server
 * refuses. Who pressed what is never shown here: members read counts only.
 */
export function AnnouncementReactions({
  announcementId,
  reactions: serverTally,
}: {
  announcementId: string;
  reactions: ReactionTally;
}) {
  const t = useTranslator();
  const locale = useLocale();

  const [tally, setTally] = useState(serverTally);
  const [pending, setPending] = useState(false);

  // A refresh of the page above brings newer counts, and they win.
  const [shownFor, setShownFor] = useState(serverTally);
  if (shownFor !== serverTally) {
    setShownFor(serverTally);
    setTally(serverTally);
  }

  async function react(pressed: ReactionValue) {
    if (pending) return;
    const previous = tally;
    const value = nextReaction(tally.own, pressed);
    setTally(applyReaction(tally, value));
    setPending(true);
    try {
      const body = await request<{ reactions: ReactionTally }>(
        `/api/announcements/${announcementId}/reaction`,
        { method: "PUT", body: { value } },
      );
      setTally(body.reactions);
    } catch (error) {
      setTally(previous);
      toast.error(requestError(locale, error));
    } finally {
      setPending(false);
    }
  }

  const thumbs = [
    { value: "like", Icon: ThumbsUpIcon, count: tally.likes, label: "news.like" },
    {
      value: "dislike",
      Icon: ThumbsDownIcon,
      count: tally.dislikes,
      label: "news.dislike",
    },
  ] as const;

  return (
    <div
      role="group"
      aria-label={t("news.reactions")}
      className="flex items-center gap-1"
    >
      {thumbs.map(({ value, Icon, count, label }) => {
        const held = tally.own === value;
        return (
          <Button
            key={value}
            type="button"
            variant={held ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={held}
            aria-label={t(label)}
            title={t(label)}
            disabled={pending}
            onClick={() => void react(value)}
            className={cn("tabular-nums", held && "text-primary")}
          >
            <Icon weight={held ? "fill" : undefined} />
            {count}
          </Button>
        );
      })}
    </div>
  );
}
