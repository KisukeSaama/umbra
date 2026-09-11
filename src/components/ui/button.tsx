import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Heights follow the pointer. A mouse is precise and the desk stays compact; a
 * finger is not, so on a touch screen every pressable control, the small and
 * icon sizes included, comes up to 40px. The variant reads the pointer rather
 * than the viewport, because a tablet in landscape is as wide as a laptop and
 * is still touched. The extra-small sizes are no exception: a compact row on
 * the desk is still pressed with a finger on a phone. Inputs, selects and tabs
 * follow the same rule, so a toolbar mixing them stays on one line.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        // A key already drawn at rest: a faint wash of the ink behind a hairline
        // inside the edge, so it is seen as something to press before the
        // pointer finds it. Word floating on the page read as a label. Hover
        // lights the same key a step further. Both are mixes of the foreground,
        // which is why one rule serves the paper and the night. The glyph
        // rests in muted ink and comes up with the word; a glyph that carries
        // its own colour keeps it.
        ghost:
          "bg-foreground/5 inset-ring inset-ring-foreground/8 hover:bg-foreground/9 hover:text-foreground hover:inset-ring-foreground/14 active:bg-foreground/12 aria-expanded:bg-foreground/9 aria-expanded:text-foreground aria-expanded:inset-ring-foreground/14 [&_svg]:transition-colors [&_svg:not([class*='text-'])]:text-muted-foreground hover:[&_svg:not([class*='text-'])]:text-foreground aria-expanded:[&_svg:not([class*='text-'])]:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 pointer-coarse:h-10 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 text-xs pointer-coarse:h-10 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[min(var(--radius-md),12px)] px-3 text-[0.9375rem] pointer-coarse:h-10 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9 pointer-coarse:size-10",
        "icon-xs":
          "size-7 rounded-[min(var(--radius-md),10px)] pointer-coarse:size-10 in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),12px)] pointer-coarse:size-10 in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * A button drawn as something else, a link most often, is not a native button,
 * and the primitive has to be told so or it warns on every page that carries
 * one. Read from `render` rather than asked of every caller: whoever hands in
 * an anchor has already said what the element is.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  render,
  nativeButton = render === undefined,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={render}
      nativeButton={nativeButton}
      {...props}
    />
  );
}

export { Button, buttonVariants };
