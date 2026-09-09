import { describe, expect, it } from "vitest";

import {
  pageHref,
  paginate,
  parsePage,
  toSearchParams,
} from "@/lib/pagination";

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
