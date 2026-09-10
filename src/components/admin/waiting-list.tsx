"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslator } from "@/lib/i18n/client";

/**
 * Who is waiting on a row of the queue, for the staff.
 *
 * One name reads as that name. Several read as the first of them and how many
 * others, and pressing that opens the whole list: the row stays one line
 * however many people asked, and the names are one press away rather than
 * pushing the buttons off the row. Members never see this.
 */
export function WaitingList({
  names,
  title,
  lead,
}: {
  /** In the order they came, so the first is whoever asked first. */
  names: string[];
  /** The title the row is about, which heads the list. */
  title: string;
  /** Written before the names, and only when there are any. */
  lead?: string;
}) {
  const t = useTranslator();
  if (names.length === 0) return null;

  const [first, ...others] = names;
  if (others.length === 0)
    return (
      <>
        {lead}
        {first}
      </>
    );

  return (
    <>
      {lead}
      <Dialog>
        <DialogTrigger className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm underline-offset-3 outline-none hover:underline focus-visible:ring-3">
          {t("admin.waitingOthers", { name: first, count: others.length })}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {t("admin.waiting", { count: names.length })}
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-border/60 divide-y">
            {names.map((name, index) => (
              <li key={`${index}:${name}`} className="py-2">
                {name}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
