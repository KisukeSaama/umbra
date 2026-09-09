import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one section heading used everywhere: a title, an optional link out, and
 * an optional aside on the right. Consistency here is most of what makes the
 * page feel calm.
 */
export function SectionHeading({
  title,
  href,
  aside,
  className,
}: {
  title: string;
  href?: string;
  aside?: ReactNode;
  className?: string;
}) {
  const heading = (
    <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
      {title}
      {href ? (
        <span className="text-muted-foreground ml-1.5 text-base">&rsaquo;</span>
      ) : null}
    </h2>
  );

  return (
    <div
      className={cn(
        "mb-4 flex items-baseline justify-between gap-4",
        className,
      )}
    >
      {href ? (
        <Link
          href={href}
          className="hover:text-primary focus-visible:ring-ring/50 rounded-md transition-colors outline-none focus-visible:ring-3"
        >
          {heading}
        </Link>
      ) : (
        heading
      )}
      {aside ? (
        <div className="text-muted-foreground text-sm">{aside}</div>
      ) : null}
    </div>
  );
}
