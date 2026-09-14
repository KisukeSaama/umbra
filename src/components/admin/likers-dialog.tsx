"use client";

import { ThumbsUpIcon } from "@/components/icons";
import { Badge, badgeVariants } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The likes of one announcement, for the staff.
 *
 * The count is the way in: pressing it opens who liked, in the same dialog the
 * queues use for who is waiting, rather than a second line under the note that
 * said the same number in words. Who disliked is never listed, by anyone.
 */
export function LikersDialog({
  title,
  likes,
  names,
}: {
  /** The announcement, which heads the list. */
  title: string;
  likes: number;
  /** In the order they reacted. */
  names: string[];
}) {
  const t = useTranslator();
  const count = (
    <>
      <ThumbsUpIcon />
      {likes}
    </>
  );

  if (names.length === 0)
    return (
      <Badge variant="outline" title={t("admin.announcements.likes")}>
        {count}
      </Badge>
    );

  return (
    <Dialog>
      <DialogTrigger
        title={t("admin.announcements.reactions")}
        className={cn(
          badgeVariants({ variant: "outline" }),
          "hover:bg-muted cursor-pointer outline-none",
        )}
      >
        {count}
        <span className="sr-only">{t("admin.announcements.reactions")}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t("admin.announcements.likedBy", { count: names.length })}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-border/60 max-h-80 divide-y overflow-y-auto">
          {names.map((name, index) => (
            <li key={`${index}:${name}`} className="py-2">
              {name}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
