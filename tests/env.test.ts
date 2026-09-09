import { describe, expect, it } from "vitest";

import { parseStoragePaths } from "@/lib/env";

describe("storage path configuration", () => {
  it("reads labelled and bare paths", () => {
    const parsed = parseStoragePaths("Movies:/data/movies, /data/series");

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ label: "Movies", path: "/data/movies" });
    expect(parsed[1]).toEqual({ label: "/data/series", path: "/data/series" });
  });

  it("does not mistake a Windows drive letter for a label", () => {
    expect(parseStoragePaths("C:\media")[0].path).toBe("C:\media");
  });

  it("returns nothing when nothing is configured", () => {
    expect(parseStoragePaths("")).toEqual([]);
    expect(parseStoragePaths("  ,  ")).toEqual([]);
  });
});
