import { cn } from "@/lib/utils";

/**
 * The Umbra mark: a messenger's crest, read as a canine head against a low moon.
 *
 * Abstract on purpose. It should feel nocturnal and quiet, and it must not
 * borrow anything from the game the name nods to.
 */
export function UmbraMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="presentation"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <defs>
        <linearGradient id="umbra-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop
            offset="100%"
            stopColor="color-mix(in oklab, var(--primary) 62%, black)"
          />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#umbra-mark)" />
      {/* The moon, half hidden behind the crest. */}
      <circle
        cx="23"
        cy="9.5"
        r="3.4"
        fill="var(--primary-foreground)"
        opacity="0.35"
      />
      <path
        d="M16 26c-4.9-2-7.5-5.5-7.5-9.9v-5.2l3.4 1.8L16 7.5l4.1 5.2 3.4-1.8v5.2c0 4.4-2.6 7.9-7.5 9.9z"
        fill="var(--primary-foreground)"
      />
      <circle cx="13.3" cy="16.2" r="1.05" fill="url(#umbra-mark)" />
      <circle cx="18.7" cy="16.2" r="1.05" fill="url(#umbra-mark)" />
    </svg>
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
}: {
  forLabel: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <UmbraMark className={compact ? "size-7" : "size-8"} />
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
