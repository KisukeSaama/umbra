import type { ComponentType, ReactNode } from "react";

import { GlyphTile } from "@/components/glyph-tile";
import type { IconProps } from "@/components/icons";

/**
 * What a glance card says when it has nothing to say.
 *
 * A sentence alone leaves a card looking broken rather than calm, so the note
 * keeps the same glyph the filled card would carry, drained of its colour. The
 * card stays short: nothing here is stretched to a neighbour's height.
 */
export function EmptyNote({
  icon,
  children,
}: {
  icon: ComponentType<IconProps>;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <GlyphTile icon={icon} />
      <p className="text-muted-foreground text-sm text-balance">{children}</p>
    </div>
  );
}
