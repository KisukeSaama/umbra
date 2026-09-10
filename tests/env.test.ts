import { describe, expect, it } from "vitest";

import { env, parseStoragePaths, resetEnvCache } from "@/lib/env";

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

describe("boolean flags", () => {
  const required = {
    DATABASE_URL: "postgres://umbra@localhost/umbra",
    JANUS_URL: "https://janus.example.com",
    JANUS_APPLICATION_ID: "umbra",
    JANUS_API_KEY: "key",
  };

  function read(values: Record<string, string | undefined>) {
    const saved = { ...process.env };
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, required);
    for (const [key, value] of Object.entries(values)) {
      // Assigning undefined to process.env would store the string "undefined".
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
    try {
      return env();
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, saved);
      resetEnvCache();
    }
  }

  /*
   * The bug this covers: `z.coerce.boolean()` is `Boolean(value)`, so the
   * string the deployment actually writes read as true and a switch meant to
   * be off was on.
   */
  it("reads the word false as false", () => {
    expect(read({ DEV_LOGIN: "false" }).DEV_LOGIN).toBe(false);
    expect(read({ DEV_LOGIN: "0" }).DEV_LOGIN).toBe(false);
  });

  it("reads the word true as true", () => {
    expect(read({ DEV_LOGIN: "true" }).DEV_LOGIN).toBe(true);
    expect(read({ DEV_LOGIN: " TRUE " }).DEV_LOGIN).toBe(true);
  });

  it("falls back to the default when absent or empty", () => {
    expect(read({ DEV_LOGIN: undefined }).DEV_LOGIN).toBe(false);
    // Compose passes an unset variable through as an empty string.
    expect(read({ DEV_LOGIN: "" }).DEV_LOGIN).toBe(false);
  });

  it("refuses a value that is neither", () => {
    expect(() => read({ DEV_LOGIN: "maybe" })).toThrow(
      /Invalid configuration/,
    );
  });
});
