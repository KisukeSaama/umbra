import { describe, expect, it } from "vitest";

import { formatBytes, formatEpisodeCode } from "@/lib/format";
import { yearOf } from "@/lib/domain/catalog";
import { isRunning } from "@/lib/providers/metadata";

describe("formatting", () => {
  it("writes storage sizes for people, not for machines", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(18_700_000_000_000)).toBe("18.7 TB");
    expect(formatBytes(18_700_000_000_000, "fr")).toContain("To");
  });

  it("writes an episode code the way a series does", () => {
    expect(formatEpisodeCode(2, 9)).toBe("S02E09");
    expect(formatEpisodeCode(12, 104)).toBe("S12E104");
  });

  it("reads a year from a release date", () => {
    expect(yearOf("2017-10-04")).toBe(2017);
    expect(yearOf(null)).toBeNull();
    expect(yearOf("")).toBeNull();
  });
});

describe("series status", () => {
  it("keeps watching a running show and lets go of a finished one", () => {
    expect(isRunning({ status: "Returning Series", inProduction: false })).toBe(
      true,
    );
    expect(isRunning({ status: "Ended", inProduction: true })).toBe(true);
    expect(isRunning({ status: "Ended", inProduction: false })).toBe(false);
    expect(isRunning({ status: null, inProduction: false })).toBe(false);
  });
});

describe("dates", () => {
  it("keeps a date-only value on its own day whatever the timezone", async () => {
    const { formatDate, formatAirDate } = await import("@/lib/format");
    expect(formatDate("2026-09-09", "en")).toContain("2026");
    expect(formatDate("2026-09-09", "en")).toContain("9");
    expect(formatAirDate("2026-09-09", "fr")).toMatch(/mer/i);
  });

  it("writes a moment with its time", async () => {
    const { formatDateTime } = await import("@/lib/format");
    const text = formatDateTime(new Date(2026, 8, 9, 10, 23), "fr");
    expect(text).toContain("2026");
    expect(text).toContain("10:23");
  });
});
