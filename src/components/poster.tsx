import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A poster, or a quiet placeholder when the provider has none.
 *
 * Posters carry the page visually, so they get a real aspect ratio and no
 * layout shift: the frame exists before the image arrives.
 *
 * The hover lift only answers a `group` wrapper, so it is the wrapper that
 * decides: a link gets it, a poster with nowhere to go does not.
 */
export function Poster({
  src,
  alt,
  captioned = false,
  className,
  sizes = "(min-width: 1024px) 12rem, (min-width: 640px) 20vw, 40vw",
  priority = false,
  ratingLabel,
}: {
  src: string | null;
  alt: string;
  /**
   * The title is printed next to the frame, so the picture carries no
   * alternative text of its own: a screen reader that reads both says the
   * title twice. The empty frame still names it, since there is nothing else
   * there to read.
   */
  captioned?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
  ratingLabel?: string;
}) {
  return (
    <div
      className={cn(
        "bg-secondary/60 border-border/60 relative aspect-[2/3] w-full overflow-hidden rounded-lg border",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={captioned ? "" : alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 ease-out-quint group-hover:scale-[1.03] group-focus-visible:scale-[1.03]"
        />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center px-2 text-center text-xs">
          {alt}
        </div>
      )}
      {ratingLabel ? (
        <span className="absolute right-2 bottom-2 max-w-[calc(100%-1rem)] rounded-md bg-[oklch(0.16_0.008_262/0.92)] px-1.5 py-1 text-right text-[10px] leading-tight font-medium text-[oklch(0.95_0.008_85)] tabular-nums sm:text-xs">
          {ratingLabel}
        </span>
      ) : null}
    </div>
  );
}
