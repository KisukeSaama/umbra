import type { ComponentType } from "react";

import type { IconProps } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The small square an empty note or an announcement carries beside its
 * subject. Never in a card title: a row of cards where some titles wear one
 * and some do not reads as two kinds of card.
 *
 * Quiet Sand and muted ink, never ochre: the lamp belongs to the one primary
 * action on the screen, and two ochre areas means one of them is wrong.
 */
export function GlyphTile({
  icon: Icon,
  className,
}: {
  icon: ComponentType<IconProps>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-secondary text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg",
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
