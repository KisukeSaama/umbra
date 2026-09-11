import type { ComponentType } from "react";

import type { IconProps } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The small square an empty note or an announcement carries beside its
 * subject. Never in a card title: a row of cards where some titles wear one
 * and some do not reads as two kinds of card.
 *
 * Quiet Sand and muted ink by default. The home announcement dresses it in
 * the Ochre Wash with an ochre glyph, a small warm mark rather than an area.
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
