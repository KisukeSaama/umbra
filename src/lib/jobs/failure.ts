import {
  AppError,
  RateLimitedError,
  UpstreamError,
  isServiceWideFailure,
} from "@/lib/errors";
import { en, type TranslationKey } from "@/lib/i18n/dictionaries";

/**
 * What a failed run says, and how it is kept.
 *
 * The run history is read on the synchronisation page, in the language of the
 * person reading it. So a failure is recorded as a key and its values rather
 * than as a sentence: the page owns the wording, as the client does for every
 * other error. The technical detail (a gateway slug, a status, a path) goes
 * beside it as it is, since it is what matches the logs.
 *
 * Kept free of the database so the loop and the wording can be tested alone.
 */
export type RunFailure = {
  key: TranslationKey;
  values?: Record<string, string | number>;
  detail?: string;
};

/** A step that ends on a failure it has already put into words. */
export class StepFailure extends Error {
  constructor(readonly failure: RunFailure) {
    super(failure.key);
    this.name = "StepFailure";
  }
}

/** How long one technical detail may run. Bounded per entry, never overall. */
const DETAIL_MAX = 200;

/** How many failed titles a summary names before it counts the rest. */
const NAMED_FAILURES = 3;

function bounded(text: string): string {
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}...` : text;
}

/** The technical side of an error, the part that matches the logs. */
function technical(error: unknown): string {
  if (error instanceof UpstreamError)
    return bounded([error.slug, error.detail].filter(Boolean).join(" "));
  if (error instanceof RateLimitedError)
    return error.retryAfter ? `Retry-After ${error.retryAfter}` : "429";
  if (error instanceof AppError) return error.messageKey;
  return bounded(error instanceof Error ? error.message : String(error));
}

/**
 * What a failed run records for the administration.
 *
 * An application error's message is its translation key, which says that a
 * provider failed but not which one or how. The run history is read by the
 * administration only, so the gateway slug and the detail go with it.
 */
export function describeFailure(error: unknown): RunFailure {
  if (error instanceof StepFailure) return error.failure;
  if (error instanceof UpstreamError)
    return {
      key: "admin.jobs.failure.upstream",
      values: { slug: error.slug },
      detail: technical(error),
    };
  if (error instanceof RateLimitedError)
    return { key: "admin.jobs.failure.rateLimited", detail: technical(error) };
  if (error instanceof AppError && error.messageKey in en)
    return { key: error.messageKey as TranslationKey };
  return { key: "admin.jobs.failure.unexpected", detail: technical(error) };
}

export type ItemFailure = { title: string; error: unknown };

/**
 * Several titles that failed, as one line: how many, the first few by name,
 * and how many more.
 *
 * The run's text used to be every failure in a row, cut at five hundred
 * characters, which kept about six of them, could stop halfway through one,
 * and named each series by its provider id. The detail keeps the technical
 * reason of the titles it names, each one whole.
 */
export function summariseSeriesFailures(
  failures: ItemFailure[],
  total: number,
): RunFailure {
  const named = failures.slice(0, NAMED_FAILURES);
  const more = failures.length - named.length;
  const values = {
    count: failures.length,
    total,
    titles: named.map((failure) => failure.title).join(", "),
  };
  return {
    key:
      more > 0 ? "admin.jobs.failure.seriesMore" : "admin.jobs.failure.series",
    values: more > 0 ? { ...values, more } : values,
    detail: named
      .map((failure) => `${failure.title}: ${technical(failure.error)}`)
      .join("; "),
  };
}

/**
 * Runs `work` on every item, one item's trouble staying that item's.
 *
 * A title the provider refuses is set aside through `onRefused`, which is
 * where the caller stamps the attempt so it waits its turn next time, and the
 * loop goes on. A failure of the whole service ends the loop there and then:
 * what is left would fail the same way, and going on would ignore the
 * `Retry-After` of a 429 or wait out the client timeout once per title.
 */
export async function eachInIsolation<T extends { title: string }>(
  items: T[],
  work: (item: T) => Promise<number>,
  onRefused: (item: T, error: unknown) => Promise<void>,
): Promise<{ done: number; refused: ItemFailure[] }> {
  let done = 0;
  const refused: ItemFailure[] = [];
  for (const item of items) {
    try {
      done += await work(item);
    } catch (error) {
      if (isServiceWideFailure(error)) throw error;
      refused.push({ title: item.title, error });
      await onRefused(item, error);
    }
  }
  return { done, refused };
}

/** A failure as the `job_run.error` column keeps it. */
export function encodeFailure(failure: RunFailure): string {
  return JSON.stringify(failure);
}

/**
 * A recorded failure, read back for display.
 *
 * Rows written before failures were recorded this way hold a sentence, or the
 * word `interrupted`; those are shown as they are, under a generic heading,
 * rather than dropped.
 */
export function decodeFailure(raw: string | null): RunFailure | null {
  if (!raw) return null;
  if (raw === "interrupted") return { key: "admin.jobs.failure.interrupted" };
  try {
    const parsed = JSON.parse(raw) as Partial<RunFailure> | null;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.key === "string" &&
      parsed.key in en
    ) {
      return {
        key: parsed.key,
        values:
          parsed.values && typeof parsed.values === "object"
            ? parsed.values
            : undefined,
        detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
      };
    }
  } catch {
    // Not one of ours: shown as it was written.
  }
  return { key: "admin.jobs.failure.unexpected", detail: raw };
}
