import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";
import { QUEUE_STAGES, type QueueOrder, type QueueStage } from "@/lib/queue";
import { cn } from "@/lib/utils";

const STAGE_KEYS = {
  todo: "admin.queue.stage.todo",
  doing: "admin.queue.stage.doing",
  done: "admin.queue.stage.done",
  all: "admin.queue.stage.all",
} as const;

const ORDER_KEYS = {
  recent: "admin.queue.recent",
  wanted: "admin.queue.wanted",
} as const;

/**
 * The bar above a queue: which stage is shown, and in what order.
 *
 * Plain links, so a filtered queue is an address that can be shared. Either
 * change goes back to page one, since page four of another cut is not the same
 * rows, and keeps the other choice. Each stage carries its count, so a stage
 * with nothing in it is known before it is opened. The active choice is Quiet
 * Sand, as in the admin nav: ochre stays with the buttons that act.
 */
export async function QueueToolbar({
  stage,
  order,
  counts,
  pathname,
  params,
}: {
  stage: QueueStage;
  order: QueueOrder;
  counts: Record<QueueStage, number>;
  pathname: string;
  params: URLSearchParams;
}) {
  const { t } = await getI18n();

  const href = (change: { stage?: QueueStage; order?: QueueOrder }) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    const nextStage = change.stage ?? stage;
    const nextOrder = change.order ?? order;
    if (nextStage === "todo") next.delete("stage");
    else next.set("stage", nextStage);
    if (nextOrder === "recent") next.delete("order");
    else next.set("order", nextOrder);
    const query = next.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  };

  const option = (active: boolean) =>
    cn(buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }));

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <nav aria-label={t("admin.queue.stages")} className="flex flex-wrap gap-1">
        {QUEUE_STAGES.map((one) => (
          <Link
            key={one}
            href={href({ stage: one })}
            aria-current={one === stage ? "page" : undefined}
            className={option(one === stage)}
          >
            {t(STAGE_KEYS[one])}
            <span className="text-muted-foreground tabular-nums">
              {counts[one]}
            </span>
          </Link>
        ))}
      </nav>

      <nav aria-label={t("admin.queue.order")} className="flex gap-1">
        {(["recent", "wanted"] as const).map((one) => (
          <Link
            key={one}
            href={href({ order: one })}
            aria-current={one === order ? "true" : undefined}
            className={option(one === order)}
          >
            {t(ORDER_KEYS[one])}
          </Link>
        ))}
      </nav>
    </div>
  );
}
