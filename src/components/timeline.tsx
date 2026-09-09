import type { TranslationKey } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * Where a thing has got to, as a line rather than a word.
 *
 * A status on its own tells you the present; the line tells you the shape of
 * the wait, which is the actual question someone opens this page with. A
 * refusal ends the line early rather than pretending the rest is still ahead.
 */
export async function Timeline({
  status,
  steps,
  prefix,
}: {
  status: string;
  steps: readonly string[];
  prefix: string;
}) {
  const t = await getTranslator();
  const reached = steps.indexOf(status);
  const stopped = reached === -1;

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {stopped ? (
        <li className="text-muted-foreground text-sm">
          {t(`${prefix}.${status}` as TranslationKey)}
        </li>
      ) : (
        steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "size-1.5 rounded-full",
                index <= reached ? "bg-primary" : "bg-muted-foreground/30",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "text-xs",
                index === reached
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {t(`${prefix}.${step}` as TranslationKey)}
            </span>
            {index < steps.length - 1 ? (
              <span
                className="bg-border hidden h-px w-4 sm:block"
                aria-hidden
              />
            ) : null}
          </li>
        ))
      )}
    </ol>
  );
}
