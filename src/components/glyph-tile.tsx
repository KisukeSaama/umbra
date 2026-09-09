import type { ComponentType } from "react";

import type { IconProps } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The small square a glance card carries beside its subject.
 *
 * Quiet Sand and muted ink, never ochre: on these cards the lamp belongs to the
 * bar that carries a value, and two ochre areas on one screen means one of them
 * is wrong.
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
