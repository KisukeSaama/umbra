import Link from "next/link";
import type { ReactNode } from "react";

import { QueueSearch } from "@/components/admin/queue-search";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";
import {
  defaultQueueOrder,
  type QueueOrder,
  type QueueStage,
} from "@/lib/queue";
import { cn } from "@/lib/utils";

const STAGE_KEYS = {
  todo: "admin.queue.stage.todo",
  doing: "admin.queue.stage.doing",
  later: "admin.queue.stage.later",
  done: "admin.queue.stage.done",
  all: "admin.queue.stage.all",
} as const;

/**
 * The bar above a queue: which stage is shown, and in what order.
 *
 * Plain links, so a filtered queue is an address that can be shared. Either
 * change goes back to page one, since page four of another cut is not the same
 * rows. Each stage carries its count, so a stage with nothing in it is known
 * before it is opened. The active choice is Quiet Sand, as in the admin nav:
 * ochre stays with the buttons that act.
 *
 * The date option is a switch: choosing it again turns the queue over, and its
 * arrow says which way it reads. Which way is the default depends on the stage
 * (see `defaultQueueOrder`), so a change of stage keeps "most wanted" but lets
 * the new stage read by date its own way.
 *
 * The search box narrows every stage at once, and the counts on the stages are
 * the rows that match: see `QueueSearch`. The links keep it, so changing stage
 * or order does not lose what was being looked for.
 *
 * The pager, when the page hands one in, sits at the end of the bar: the next
 * page is reached from where the reader already is, without scrolling past
 * every row first. The bar at the foot of the list stays for whoever did.
 */
export async function QueueToolbar({
  stage,
  order,
  search,
  stages,
  counts,
  pathname,
  params,
  pager,
}: {
  stage: QueueStage;
  order: QueueOrder;
  /** What the queue was searched for, as `parseQueueSearch` read it. */
  search: string;
  /** The stages this queue is cut into: the report queue has no `later`. */
  stages: readonly QueueStage[];
  counts: Partial<Record<QueueStage, number>>;
  pathname: string;
  params: URLSearchParams;
  /** A compact `Pagination`, drawn after the order. */
  pager?: ReactNode;
}) {
  const { t } = await getI18n();

  const href = (change: { stage?: QueueStage; order?: QueueOrder }) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    const nextStage = change.stage ?? stage;
    const nextOrder =
      change.order ??
      (change.stage && order !== "wanted"
        ? defaultQueueOrder(nextStage)
        : order);
    if (nextStage === "todo") next.delete("stage");
    else next.set("stage", nextStage);
    if (nextOrder === defaultQueueOrder(nextStage)) next.delete("order");
    else next.set("order", nextOrder);
    const query = next.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  };

  // A segmented control: the track carries the surface, so no option is words
  // floating on the page, and the chosen one is lifted out of it as a sheet.
  const track =
    "bg-foreground/5 inset-ring-foreground/8 flex flex-wrap gap-0.5 rounded-lg p-0.5 inset-ring";
  const option = (active: boolean) =>
    cn(
      buttonVariants({ variant: "ghost", size: "sm" }),
      "bg-transparent inset-ring-0 hover:bg-foreground/6",
      active &&
        // At night the sheet is too close to the track to read as chosen, so
        // the lift is a stronger wash of the ink instead.
        "bg-card text-foreground inset-ring-foreground/10 hover:bg-card dark:bg-foreground/12 dark:hover:bg-foreground/12 inset-ring shadow-xs",
    );

  const byDate = order !== "wanted";
  const oldest = order === "oldest";
  const DateArrow = oldest ? ArrowUpIcon : ArrowDownIcon;
  const direction = t(
    oldest ? "admin.queue.oldestFirst" : "admin.queue.newestFirst",
  );

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <nav aria-label={t("admin.queue.stages")} className={track}>
        {stages.map((one) => (
          <Link
            key={one}
            href={href({ stage: one })}
            aria-current={one === stage ? "page" : undefined}
            className={option(one === stage)}
          >
            {t(STAGE_KEYS[one])}
            <span className="text-muted-foreground tabular-nums">
              {counts[one] ?? 0}
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <QueueSearch
          pathname={pathname}
          query={params.toString()}
          search={search}
        />
        <nav aria-label={t("admin.queue.order")} className={track}>
          <Link
            href={href({ order: order === "oldest" ? "recent" : "oldest" })}
            aria-current={byDate ? "true" : undefined}
            title={byDate ? direction : undefined}
            className={option(byDate)}
          >
            {t("admin.queue.recent")}
            {byDate ? (
              <>
                <DateArrow aria-hidden className="text-muted-foreground" />
                <span className="sr-only">{direction}</span>
              </>
            ) : null}
          </Link>
          <Link
            href={href({ order: "wanted" })}
            aria-current={order === "wanted" ? "true" : undefined}
            className={option(order === "wanted")}
          >
            {t("admin.queue.wanted")}
          </Link>
        </nav>
        {pager}
      </div>
    </div>
  );
}
