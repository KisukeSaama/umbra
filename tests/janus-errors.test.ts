import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: () => ({
    JANUS_URL: "https://janus.test",
    JANUS_APPLICATION_ID: "app",
    JANUS_API_KEY: "key",
  }),
}));

import { RateLimitedError, UpstreamError } from "@/lib/errors";
import { janus } from "@/lib/janus";

function answer(status: number, body: unknown, contentType: string) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": contentType },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function failure(): Promise<unknown> {
  return janus({ slug: "tmdb-v3", path: "/tv/1" }).then(
    () => null,
    (error: unknown) => error,
  );
}

describe("the Janus client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps its own identifying headers whatever a call site sends", async () => {
    const fetch = answer(200, {}, "application/json");
    await janus({
      slug: "tmdb-v3",
      path: "/tv/1",
      headers: {
        "X-Janus-Application-Id": "forged",
        "X-Janus-Api-Key": "forged",
      },
    });
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["X-Janus-Application-Id"]).toBe("app");
    expect(headers["X-Janus-Api-Key"]).toBe("key");
  });

  it.each([401, 403])(
    "records the gateway's reason for a %i refusal",
    async (status) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      answer(
        status,
        { detail: "not connected to that API" },
        "application/problem+json",
      );
      const error = await failure();
      expect(error).toBeInstanceOf(UpstreamError);
      expect((error as UpstreamError).origin).toBe("gateway");
      expect((error as UpstreamError).upstreamStatus).toBe(status);
      expect((error as UpstreamError).detail).toContain(
        "not connected to that API",
      );
    },
  );

  it("says a gateway 404 may be a disabled record, with its reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answer(404, { detail: "api disabled" }, "application/problem+json");
    const error = (await failure()) as UpstreamError;
    expect(error.origin).toBe("gateway");
    expect(error.detail).toContain("disabled");
    expect(error.detail).toContain("api disabled");
  });

  it("tells an answer of the API itself from a gateway refusal", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answer(404, { status_message: "not found" }, "application/json");
    const error = (await failure()) as UpstreamError;
    expect(error.origin).toBe("upstream");
    expect(error.upstreamStatus).toBe(404);
    expect(error.detail).toBe("status 404 on /tv/1");
  });

  it("reads a 429 as a quota, whoever sent it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answer(429, { detail: "quota" }, "application/problem+json");
    expect(await failure()).toBeInstanceOf(RateLimitedError);
  });

  it("marks a call nobody answered as a network failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const error = (await failure()) as UpstreamError;
    expect(error.origin).toBe("network");
  });
});
