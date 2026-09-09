import { describe, expect, it } from "vitest";

import {
  EPISORT_FILES_MAX,
  EPISORT_LINK_MAX_LENGTH,
  episortLink,
} from "@/lib/episort";

describe("episort links", () => {
  it("names the volume and the folder, never an absolute path", () => {
    expect(
      episortLink({ volume: "Media", path: ["Series", "Some Show"] }),
    ).toBe("episort://open?volume=Media&path=Series%2FSome+Show");
    expect(episortLink({ volume: "Media", path: [] })).toBe(
      "episort://open?volume=Media&path=",
    );
  });

  it("carries the selected files inside the folder", () => {
    expect(
      episortLink({
        volume: "Media",
        path: ["Incoming"],
        files: ["a.mkv", "b & c.mkv"],
      }),
    ).toBe(
      "episort://open?volume=Media&path=Incoming&file=a.mkv&file=b+%26+c.mkv",
    );
  });

  it("falls back to the folder alone when the link would be too long", () => {
    const files = Array.from({ length: 150 }, (_, i) => `Episode ${i}.mkv`);

    const link = episortLink({ volume: "Media", path: ["Incoming"], files });

    expect(link.length).toBeLessThanOrEqual(EPISORT_LINK_MAX_LENGTH);
    expect(link).toBe("episort://open?volume=Media&path=Incoming");
  });

  it("never lists more files than Episort accepts", () => {
    const files = Array.from(
      { length: EPISORT_FILES_MAX + 50 },
      (_, i) => `${i}`,
    );

    const link = episortLink({ volume: "M", path: [], files });

    const count = (link.match(/file=/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(EPISORT_FILES_MAX);
  });
});
