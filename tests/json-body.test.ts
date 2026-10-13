import { describe, expect, it } from "vitest";
import { z } from "zod";

import { jsonBody } from "@/lib/api";
import { BadRequestError } from "@/lib/errors";

const schema = z.object({ text: z.string() }).passthrough();
const CAP = 64 * 1024;

/** A body with no declared length, sent the way a chunked upload arrives. */
function chunked(parts: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Request("https://umbra.test/api/x", {
    method: "POST",
    body,
    // @ts-expect-error `duplex` is required by undici for a streamed body.
    duplex: "half",
  });
}

describe("request body cap", () => {
  it("reads a small body", async () => {
    await expect(
      jsonBody(chunked(['{"text":', '"hello"}']), schema),
    ).resolves.toEqual({ text: "hello" });
  });

  it("refuses a chunked body past the cap", async () => {
    const filler = "a".repeat(16 * 1024);
    const parts = ['{"text":"', filler, filler, filler, filler, '"}'];
    await expect(jsonBody(chunked(parts), schema)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("counts bytes, not characters", async () => {
    // Fewer characters than the cap, about three times as many bytes.
    const text = "€".repeat(CAP / 2);
    expect(text.length).toBeLessThan(CAP);
    await expect(
      jsonBody(chunked([JSON.stringify({ text })]), schema),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("refuses a declared length past the cap before reading", async () => {
    const request = new Request("https://umbra.test/api/x", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(CAP + 1) },
    });
    await expect(jsonBody(request, schema)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });
});
