import { describe, expect, it } from "vitest";

import { isCrossSiteMutation } from "@/lib/csrf";

function headersOf(entries: Record<string, string>) {
  return new Headers(entries);
}

describe("cross-site mutation guard", () => {
  it("lets reads through whatever their origin", () => {
    const headers = headersOf({
      origin: "https://evil.example",
      host: "umbra.example",
    });
    expect(isCrossSiteMutation("GET", headers)).toBe(false);
    expect(isCrossSiteMutation("HEAD", headers)).toBe(false);
  });

  it("trusts the browser's own verdict first", () => {
    expect(
      isCrossSiteMutation(
        "POST",
        headersOf({ "sec-fetch-site": "same-origin", host: "umbra.example" }),
      ),
    ).toBe(false);
    expect(
      isCrossSiteMutation(
        "POST",
        headersOf({
          "sec-fetch-site": "cross-site",
          origin: "https://umbra.example",
          host: "umbra.example",
        }),
      ),
    ).toBe(true);
    expect(
      isCrossSiteMutation(
        "PATCH",
        headersOf({ "sec-fetch-site": "same-site", host: "umbra.example" }),
      ),
    ).toBe(true);
  });

  it("compares the origin with the served host otherwise", () => {
    expect(
      isCrossSiteMutation(
        "POST",
        headersOf({ origin: "https://umbra.example", host: "umbra.example" }),
      ),
    ).toBe(false);
    expect(
      isCrossSiteMutation(
        "POST",
        headersOf({ origin: "https://evil.example", host: "umbra.example" }),
      ),
    ).toBe(true);
    expect(
      isCrossSiteMutation(
        "DELETE",
        headersOf({ origin: "null", host: "umbra.example" }),
      ),
    ).toBe(true);
  });

  it("prefers the forwarded host behind the reverse proxy", () => {
    expect(
      isCrossSiteMutation(
        "POST",
        headersOf({
          origin: "https://umbra.example",
          host: "web:3000",
          "x-forwarded-host": "umbra.example",
        }),
      ),
    ).toBe(false);
  });

  it("lets a request without any browser origin through", () => {
    // The sync worker and command-line clients: no Origin, no cookie either.
    expect(isCrossSiteMutation("POST", headersOf({ host: "web:3000" }))).toBe(
      false,
    );
  });
});
