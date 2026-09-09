import Image from "next/image";

import logoFigure from "@/assets/logo.png";
import logoMark from "@/assets/logo-mark.png";
import { cn } from "@/lib/utils";

/**
 * The Umbra mark: the messenger, cropped to the head and the letter it carries.
 *
 * The full figure loses its subject below roughly 40px, so anything small (the
 * header, the footer, a tab) gets this crop instead of a shrunken portrait.
 */
export function UmbraMark({ className }: { className?: string }) {
  return (
    <Image
      src={logoMark}
      alt=""
      aria-hidden="true"
      sizes="64px"
      className={cn("size-8 shrink-0 object-contain", className)}
    />
  );
}

/**
 * The messenger, whole and seated.
 *
 * Reserved for the screens that have room to be quiet about it: the sign-in
 * page and the home hero. `alt` is a real description because on sign-in this
 * image is the only thing on the page besides the wordmark.
 */
export function UmbraFigure({
  alt,
  className,
  sizes = "(min-width: 640px) 18rem, 12rem",
  preload = false,
}: {
  alt: string;
  className?: string;
  sizes?: string;
  preload?: boolean;
}) {
  return (
    <Image
      src={logoFigure}
      alt={alt}
      sizes={sizes}
      preload={preload}
      placeholder="blur"
      className={cn("h-auto w-full object-contain select-none", className)}
    />
  );
}

/**
 * The lockup. The second line is the whole point of the product: Umbra is not a
 * standalone site, it is the front door of one specific server.
 */
export function UmbraWordmark({
  forLabel,
  className,
  compact = false,
  withMark = true,
}: {
  forLabel: string;
  className?: string;
  compact?: boolean;
  /** Dropped where the full figure already stands above, to show one dog, not two. */
  withMark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {withMark ? (
        <UmbraMark className={compact ? "size-9" : "size-11"} />
      ) : null}
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-[0.22em] uppercase",
            compact ? "text-sm" : "text-base",
          )}
        >
          Umbra
        </span>
        <span className="text-muted-foreground mt-1 text-[0.62rem] tracking-[0.18em] uppercase">
          {forLabel}
        </span>
      </span>
    </span>
  );
}
