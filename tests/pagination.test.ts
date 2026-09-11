import { describe, expect, it } from "vitest";

import {
  mergePage,
  mergePageBy,
  mergeWindow,
  pageHref,
  paginate,
  parsePage,
  toSearchParams,
} from "@/lib/pagination";
import {
  compareQueueRows,
  parseQueueOrder,
  parseQueueStage,
} from "@/lib/queue";

describe("ordering an administration queue", () => {
  it("opens on what waits for a decision", () => {
    expect(parseQueueStage(undefined)).toBe("todo");
    expect(parseQueueStage("nonsense")).toBe("todo");
    expect(parseQueueStage("done")).toBe("done");
    expect(parseQueueStage(["all", "todo"])).toBe("all");
  });

  it("reads oldest first unless asked otherwise", () => {
    expect(parseQueueOrder(undefined)).toBe("oldest");
    expect(parseQueueOrder("anything")).toBe("oldest");
    expect(parseQueueOrder("recent")).toBe("recent");
    expect(parseQueueOrder("wanted")).toBe("wanted");
    expect(parseQueueOrder(["wanted", "recent"])).toBe("wanted");
  });

  const row = (id: string, waiting: number, day: number) => ({
    id,
    waiting,
    createdAt: new Date(Date.UTC(2026, 0, day)),
  });
  const requests = [row("r1", 1, 5), row("r2", 4, 2)];
  const asks = [row("a1", 4, 3), row("a2", 2, 1)];

  it("merges two tables newest first", () => {
    const page = paginate(4, 1, 10);
    const ids = mergePageBy(page, [requests, asks], compareQueueRows("recent"))
      .map(({ id }) => id);
    expect(ids).toEqual(["r1", "a1", "r2", "a2"]);
  });

  it("merges two tables oldest first", () => {
    const page = paginate(4, 1, 10);
    const ids = mergePageBy(
      page,
      [[...requests].reverse(), [...asks].reverse()],
      compareQueueRows("oldest"),
    ).map(({ id }) => id);
    expect(ids).toEqual(["a2", "r2", "a1", "r1"]);
  });

  it("merges two tables by who waits most, oldest first among equals", () => {
    const page = paginate(4, 1, 10);
    const ids = mergePageBy(
      page,
      [[...requests].reverse(), asks],
      compareQueueRows("wanted"),
    ).map(({ id }) => id);
    expect(ids).toEqual(["r2", "a1", "a2", "r1"]);
  });
});

describe("reading a page number", () => {
  it("takes a whole number above zero", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["2", "5"])).toBe(2);
  });

  it("falls back to the first page on anything else", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage(null)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-4")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
    expect(parsePage("last")).toBe(1);
  });
});

describe("slicing a list", () => {
  it("counts the pages and where each one starts", () => {
    expect(paginate(25, 1, 10)).toMatchObject({ pageCount: 3, offset: 0 });
    expect(paginate(25, 2, 10)).toMatchObject({ pageCount: 3, offset: 10 });
    expect(paginate(30, 3, 10)).toMatchObject({ pageCount: 3, offset: 20 });
  });

  it("keeps an empty list on a single page", () => {
    expect(paginate(0, 1, 10)).toMatchObject({
      page: 1,
      pageCount: 1,
      offset: 0,
    });
  });

  it("clamps a page number past the end back into the list", () => {
    expect(paginate(25, 9, 10)).toMatchObject({ page: 3, offset: 20 });
    expect(paginate(25, 0, 10)).toMatchObject({ page: 1, offset: 0 });
  });
});

describe("the address of another page", () => {
  it("keeps every other parameter", () => {
    const params = toSearchParams({ q: "dune", page: "2" });
    expect(pageHref("/news", params, "page", 3)).toBe("/news?q=dune&page=3");
  });

  it("drops the parameter on the first page", () => {
    const params = toSearchParams({ page: "4" });
    expect(pageHref("/news", params, "page", 1)).toBe("/news");
  });

  it("pages one list without touching the other", () => {
    const params = toSearchParams({ requests: "2", reports: "3" });
    expect(pageHref("/activity", params, "reports", 4, "reports")).toBe(
      "/activity?requests=2&reports=4#reports",
    );
  });

  it("carries a repeated parameter through", () => {
    const params = toSearchParams({ tag: ["a", "b"] });
    expect(pageHref("/news", params, "page", 2)).toBe(
      "/news?tag=a&tag=b&page=2",
    );
  });
});

describe("a page of two lists", () => {
  const at = (row: { at: string }) => new Date(row.at);
  const a1 = { id: "a1", at: "2026-09-01T10:00:00Z" };
  const a2 = { id: "a2", at: "2026-09-03T10:00:00Z" };
  const b1 = { id: "b1", at: "2026-09-02T10:00:00Z" };
  const b2 = { id: "b2", at: "2026-09-04T10:00:00Z" };

  it("reads each side up to the end of the wanted page", () => {
    // Neither table can be offset on its own: the tenth line of the merged
    // list may be the tenth of one side or the first of the other.
    expect(mergeWindow(paginate(40, 1, 10))).toEqual({ limit: 10, offset: 0 });
    expect(mergeWindow(paginate(40, 3, 10))).toEqual({ limit: 30, offset: 0 });
  });

  it("interleaves by date, newest first", () => {
    expect(
      mergePage(
        paginate(4, 1, 10),
        [
          [a2, a1],
          [b2, b1],
        ],
        at,
      ).map((r) => r.id),
    ).toEqual(["b2", "a2", "b1", "a1"]);
  });

  it("cuts the asked page out of the merged list", () => {
    const page = paginate(4, 2, 2);
    expect(
      mergePage(
        page,
        [
          [a2, a1],
          [b2, b1],
        ],
        at,
      ).map((r) => r.id),
    ).toEqual(["b1", "a1"]);
  });

  it("keeps the order the lists were given in on a tie", () => {
    const first = { id: "first", at: "2026-09-01T10:00:00Z" };
    const second = { id: "second", at: "2026-09-01T10:00:00Z" };
    expect(
      mergePage(paginate(2, 1, 10), [[first], [second]], at).map((r) => r.id),
    ).toEqual(["first", "second"]);
  });

  it("hands back nothing rather than throwing past the end", () => {
    expect(mergePage(paginate(0, 1, 10), [[], []], at)).toEqual([]);
  });
});
