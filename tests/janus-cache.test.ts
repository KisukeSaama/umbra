import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: () => ({
    JANUS_URL: "https://janus.test",
    JANUS_APPLICATION_ID: "app",
    JANUS_API_KEY: "key",
    JANUS_PLEX_TV_SLUG: "plex-tv",
    PLEX_PRODUCT: "Umbra",
    PLEX_CLIENT_ID: "client",
  }),
}));

import { UpstreamError } from "@/lib/errors";
import { accountOf, hasServerAccess } from "@/lib/providers/plex-tv";

function answer(cache: string | null, body: unknown) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cache) headers.set("X-Janus-Cache", cache);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { headers })),
  );
}

describe("calls carrying a member's Plex token", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["HIT", "STALE", "hit"])(
    "refuses an account answered from the gateway cache (%s)",
    async (cache) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      answer(cache, { id: 1, username: "someone-else" });
      await expect(accountOf("token")).rejects.toBeInstanceOf(UpstreamError);
    },
  );

  it("refuses a server list answered from the gateway cache", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    answer("HIT", []);
    await expect(hasServerAccess("token", "machine")).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it.each([null, "MISS", "BYPASS"])(
    "accepts a fresh answer (%s)",
    async (cache) => {
      answer(cache, { id: 7, username: "member" });
      await expect(accountOf("token")).resolves.toEqual({
        id: "7",
        username: "member",
      });
    },
  );
});
