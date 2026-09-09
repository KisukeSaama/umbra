import { beforeEach, describe, expect, it } from "vitest";

import { checkRate, perMinute, resetRateLimits } from "@/lib/rate-limit";

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
