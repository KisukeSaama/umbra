import { describe, expect, it } from "vitest";

import { safeEquals } from "@/lib/auth/compare";

describe("constant-time comparison", () => {
  it("matches equal strings only", () => {
    expect(safeEquals("secret-token-value", "secret-token-value")).toBe(true);
    expect(safeEquals("secret-token-value", "secret-token-valuf")).toBe(false);
    expect(safeEquals("secret-token-value", "secret")).toBe(false);
    expect(safeEquals("", "")).toBe(true);
  });
});
