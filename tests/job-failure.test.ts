import { describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  UpstreamError,
  isServiceWideFailure,
} from "@/lib/errors";
import { createTranslator } from "@/lib/i18n";
import {
  StepFailure,
  decodeFailure,
  describeFailure,
  eachInIsolation,
  encodeFailure,
  summariseSeriesFailures,
} from "@/lib/jobs/failure";

const notFound = () =>
  new UpstreamError("tmdb-v3", "status 404 on /tv/1/season/3", {
    origin: "upstream",
    status: 404,
  });

describe("a failure that belongs to one title", () => {
  it.each([
    ["an upstream 404", notFound()],
    ["an upstream 422", new UpstreamError("tmdb-v3", "x", { status: 422 })],
    ["an unreadable payload", new UpstreamError("tmdb-v3", "unreadable")],
    ["a title the provider cannot read", new NotFoundError()],
    ["a re-cut refused by the tracker", new ConflictError("error.seriesIsCut")],
    ["an unexpected error", new Error("boom")],
  ])("is %s", (_, error) => {
    expect(isServiceWideFailure(error)).toBe(false);
  });
});

describe("a failure of the whole service", () => {
  it.each([
    ["a quota reached", new RateLimitedError("30")],
    [
      "a gateway refusal",
      new UpstreamError("tmdb-v3", "x", { origin: "gateway", status: 403 }),
    ],
    [
      "a timeout",
      new UpstreamError("tmdb-v3", "no answer", { origin: "network" }),
    ],
    [
      "a provider down",
      new UpstreamError("tmdb-v3", "x", { origin: "upstream", status: 503 }),
    ],
    [
      "a credential the provider rejects",
      new UpstreamError("tmdb-v3", "x", { origin: "upstream", status: 401 }),
    ],
  ])("is %s", (_, error) => {
    expect(isServiceWideFailure(error)).toBe(true);
  });
});

describe("the per-title loop", () => {
  const items = [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Beta" },
    { id: "c", title: "Gamma" },
  ];

  it("sets a refused title aside and goes on with the others", async () => {
    const work = vi.fn(async (item: { id: string }) => {
      if (item.id === "b") throw notFound();
      return 2;
    });
    const onRefused = vi.fn(async () => {});

    const result = await eachInIsolation(items, work, onRefused);

    expect(work).toHaveBeenCalledTimes(3);
    expect(result.done).toBe(4);
    expect(result.refused.map((failure) => failure.title)).toEqual(["Beta"]);
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(onRefused).toHaveBeenCalledWith(items[1], expect.any(UpstreamError));
  });

  it.each([
    ["a quota reached", new RateLimitedError("60")],
    [
      "a gateway refusal",
      new UpstreamError("tmdb-v3", "refused", { origin: "gateway" }),
    ],
  ])(
    "stops at %s before the next title is asked for, and stamps nothing",
    async (_, failure) => {
      const work = vi.fn(async (item: { id: string }) => {
        if (item.id === "b") throw failure;
        return 1;
      });
      const onRefused = vi.fn(async () => {});

      await expect(eachInIsolation(items, work, onRefused)).rejects.toBe(
        failure,
      );
      expect(work).toHaveBeenCalledTimes(2);
      expect(onRefused).not.toHaveBeenCalled();
    },
  );
});

describe("what a failed run records", () => {
  it("names the slug and keeps the technical detail of a provider failure", () => {
    expect(describeFailure(notFound())).toEqual({
      key: "admin.jobs.failure.upstream",
      values: { slug: "tmdb-v3" },
      detail: "tmdb-v3 status 404 on /tv/1/season/3",
    });
  });

  it("says a quota was reached, with the wait asked for", () => {
    expect(describeFailure(new RateLimitedError("30"))).toEqual({
      key: "admin.jobs.failure.rateLimited",
      detail: "Retry-After 30",
    });
  });

  it("uses an application error's own key", () => {
    expect(describeFailure(new ConflictError("error.seriesIsCut"))).toEqual({
      key: "error.seriesIsCut",
    });
  });

  it("keeps the message of anything else, cut at two hundred characters", () => {
    expect(describeFailure(new Error("x".repeat(1000)))).toEqual({
      key: "admin.jobs.failure.unexpected",
      detail: `${"x".repeat(200)}...`,
    });
  });

  it("passes through a failure the step has already worded", () => {
    const worded = { key: "admin.jobs.failure.unexpected" as const };
    expect(describeFailure(new StepFailure(worded))).toBe(worded);
  });
});

describe("a summary of refused series", () => {
  const failures = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      title: `Series ${index + 1}`,
      error: notFound(),
    }));

  it("names every title when there are few", () => {
    const summary = summariseSeriesFailures(failures(2), 20);
    expect(summary.key).toBe("admin.jobs.failure.series");
    expect(summary.values).toEqual({
      count: 2,
      total: 20,
      titles: "Series 1, Series 2",
    });
  });

  it("names the first three by title and counts the rest", () => {
    const summary = summariseSeriesFailures(failures(9), 20);
    expect(summary.key).toBe("admin.jobs.failure.seriesMore");
    expect(summary.values).toEqual({
      count: 9,
      total: 20,
      titles: "Series 1, Series 2, Series 3",
      more: 6,
    });
    // Each named entry whole, and none of the others.
    expect(summary.detail!.split("; ")).toEqual([
      "Series 1: tmdb-v3 status 404 on /tv/1/season/3",
      "Series 2: tmdb-v3 status 404 on /tv/1/season/3",
      "Series 3: tmdb-v3 status 404 on /tv/1/season/3",
    ]);
  });
});

describe("a recorded failure, read back", () => {
  it("reads back what was written", () => {
    const failure = summariseSeriesFailures(
      [{ title: "Frieren", error: notFound() }],
      4,
    );
    expect(decodeFailure(encodeFailure(failure))).toEqual(failure);
  });

  it("words the runs closed for silence, old and new", () => {
    expect(decodeFailure("interrupted")).toEqual({
      key: "admin.jobs.failure.interrupted",
    });
    expect(
      decodeFailure(encodeFailure({ key: "admin.jobs.failure.interrupted" })),
    ).toEqual({ key: "admin.jobs.failure.interrupted" });
  });

  it("shows an older sentence as it was written", () => {
    expect(decodeFailure("error.upstream tmdb-v3 status 502")).toEqual({
      key: "admin.jobs.failure.unexpected",
      detail: "error.upstream tmdb-v3 status 502",
    });
  });

  it("refuses a key no dictionary holds", () => {
    expect(decodeFailure(JSON.stringify({ key: "nope" }))?.key).toBe(
      "admin.jobs.failure.unexpected",
    );
  });
});

describe("a recorded failure, worded", () => {
  it.each(["en", "fr"] as const)(
    "leaves no placeholder unfilled once worded in %s",
    (locale) => {
      const t = createTranslator(locale);
      const many = Array.from({ length: 5 }, (_, index) => ({
        title: `Series ${index + 1}`,
        error: notFound(),
      }));
      for (const failure of [
        describeFailure(notFound()),
        describeFailure(new RateLimitedError("30")),
        summariseSeriesFailures(many.slice(0, 1), 4),
        summariseSeriesFailures(many.slice(0, 2), 4),
        summariseSeriesFailures(many, 20),
      ]) {
        expect(t(failure.key, failure.values)).not.toMatch(/\{\w+\}/);
      }
    },
  );
});
