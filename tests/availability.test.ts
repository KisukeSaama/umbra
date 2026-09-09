import { describe, expect, it } from "vitest";

import { availabilityOf, isOnServer } from "@/lib/domain/availability";

describe("availability", () => {
  it("calls a title the server holds whole available", () => {
    expect(availabilityOf({ inLibrary: true })).toBe("available");
  });

  it("calls a title the server holds with a known gap partial", () => {
    expect(availabilityOf({ inLibrary: true, incomplete: true })).toBe(
      "partial",
    );
  });

  it("prefers presence over a request", () => {
    expect(availabilityOf({ inLibrary: true, requested: true })).toBe(
      "available",
    );
    expect(
      availabilityOf({ inLibrary: true, incomplete: true, requested: true }),
    ).toBe("partial");
  });

  it("never calls an absent title partial", () => {
    expect(availabilityOf({ inLibrary: false, incomplete: true })).toBe(
      "absent",
    );
  });

  it("reads a live request only when nothing is on the server", () => {
    expect(availabilityOf({ inLibrary: false, requested: true })).toBe(
      "requested",
    );
    expect(availabilityOf({ inLibrary: false })).toBe("absent");
  });
});

describe("presence", () => {
  it("counts partly held as held", () => {
    expect(isOnServer("available")).toBe(true);
    expect(isOnServer("partial")).toBe(true);
  });

  it("counts nothing else as held", () => {
    expect(isOnServer("requested")).toBe(false);
    expect(isOnServer("absent")).toBe(false);
  });
});
