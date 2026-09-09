import { beforeEach, describe, expect, it } from "vitest";

import {
  checkRate,
  clientAddress,
  perMinute,
  resetRateLimits,
} from "@/lib/rate-limit";

describe("rate limiting", () => {
  beforeEach(() => resetRateLimits());

  it("refuses past the quota and opens the next window", () => {
    const quota = perMinute(2);
    const now = 1_000_000;

    expect(() => checkRate("requests", "a", quota, now)).not.toThrow();
    expect(() => checkRate("requests", "a", quota, now)).not.toThrow();
    expect(() => checkRate("requests", "a", quota, now)).toThrow();

    // Another person is unaffected.
    expect(() => checkRate("requests", "b", quota, now)).not.toThrow();
    // And so is another kind of action.
    expect(() => checkRate("vote", "a", quota, now)).not.toThrow();

    expect(() => checkRate("requests", "a", quota, now + 60_001)).not.toThrow();
  });
});

describe("client address", () => {
  it("takes the address the edge vouches for before any forwarded hint", () => {
    expect(
      clientAddress(
        new Headers({
          "cf-connecting-ip": "203.0.113.7",
          "x-real-ip": "198.51.100.2",
          "x-forwarded-for": "10.0.0.1, 198.51.100.2",
        }),
      ),
    ).toBe("203.0.113.7");
    expect(
      clientAddress(
        new Headers({
          "x-real-ip": "198.51.100.2",
          "x-forwarded-for": "10.0.0.1, 198.51.100.2",
        }),
      ),
    ).toBe("198.51.100.2");
  });

  it("falls back to the first forwarded address, then to a placeholder", () => {
    expect(
      clientAddress(new Headers({ "x-forwarded-for": " 10.0.0.1 , 10.0.0.2" })),
    ).toBe("10.0.0.1");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
