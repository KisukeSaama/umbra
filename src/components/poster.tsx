import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A poster, or a quiet placeholder when the provider has none.
 *
 * Posters carry the page visually, so they get a real aspect ratio and no
 * layout shift: the frame exists before the image arrives.
 */
export function Poster({
  src,
  alt,
  className,
  sizes = "(min-width: 1024px) 12rem, (min-width: 640px) 20vw, 40vw",
  priority = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
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
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center px-2 text-center text-xs">
          {alt}
        </div>
      )}
    </div>
  );
}
