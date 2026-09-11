import { describe, expect, it } from "vitest";

import type { StorageNode } from "@/lib/db/schema";
import {
  daysLeft,
  roomFor,
  roughly,
  storageState,
  typicalSizes,
} from "@/lib/domain/storage-room";

const GB = 1_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function dir(name: string, bytes: number, children: StorageNode[] = []) {
  return { name, bytes, kind: "directory" as const, children };
}

describe("typical title sizes", () => {
  const roots = [
    dir("Media", 0, [
      dir("Movies", 0, [
        dir("Arrival (2016)", 4 * GB),
        dir("Heat (1995)", 6 * GB, [dir("Featurettes", 1 * GB)]),
        dir("Dune (2021)", 60 * GB),
      ]),
      dir("Series", 0, [
        dir("Severance", 30 * GB, [
          dir("Season 01", 15 * GB),
          dir("Season 02", 15 * GB),
        ]),
        dir("Dark", 10 * GB, [dir("Saison 1", 10 * GB)]),
      ]),
    ]),
  ];

  it("weighs a film by the median, so one remux does not skew it", () => {
    expect(typicalSizes(roots, 40).movieBytes).toBe(6 * GB);
  });

  it("tells a series by its season folders, and weighs an episode from it", () => {
    expect(typicalSizes(roots, 40).episodeBytes).toBe(1 * GB);
  });

  it("says nothing it cannot know", () => {
    expect(typicalSizes([], 0)).toEqual({
      movieBytes: null,
      episodeBytes: null,
    });
    expect(typicalSizes(roots, 0).episodeBytes).toBeNull();
  });
});

describe("room left", () => {
  it("counts whole titles, and nothing without a size", () => {
    expect(roomFor(100 * GB, 6 * GB)).toBe(16);
    expect(roomFor(100 * GB, null)).toBeNull();
  });

  it("rounds the way a person does", () => {
    expect(roughly(7)).toBe(7);
    expect(roughly(63)).toBe(65);
    expect(roughly(418)).toBe(420);
    expect(roughly(2340)).toBe(2300);
  });
});

describe("pace", () => {
  const now = new Date("2026-09-11T00:00:00Z");
  const then = new Date(now.getTime() - 20 * DAY);

  it("projects the fill of the window onto what is left", () => {
    expect(
      daysLeft(
        { recordedAt: then, usedBytes: 800 * GB },
        { recordedAt: now, usedBytes: 1000 * GB, availableBytes: 300 * GB },
      ),
    ).toBe(30);
  });

  it("stays silent on too little history or a disk that is not filling", () => {
    const recent = new Date(now.getTime() - 3 * DAY);
    expect(
      daysLeft(
        { recordedAt: recent, usedBytes: 800 * GB },
        { recordedAt: now, usedBytes: 1000 * GB, availableBytes: 300 * GB },
      ),
    ).toBeNull();
    expect(
      daysLeft(
        { recordedAt: then, usedBytes: 1000 * GB },
        { recordedAt: now, usedBytes: 900 * GB, availableBytes: 300 * GB },
      ),
    ).toBeNull();
  });
});

describe("state", () => {
  it("reads the ratio and the pace together", () => {
    expect(storageState(0.5, null)).toBe("roomy");
    expect(storageState(0.9, null)).toBe("tight");
    expect(storageState(0.96, null)).toBe("full");
    expect(storageState(0.5, 45)).toBe("tight");
    expect(storageState(0.5, 10)).toBe("full");
  });
});
