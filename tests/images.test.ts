import {
  mkdtemp,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cappedBytes } from "@/lib/api";
import { isFeaturedNow, uploadUrl } from "@/lib/announcements";
import {
  featureSchema,
  imageSchema,
} from "@/app/api/admin/announcements/schema";
import { resetEnvCache } from "@/lib/env";
import { MAX_IMAGE_SIDE, processImage } from "@/lib/images";

/** A picture made on the spot: no fixture file to keep in the repository. */
async function picture(
  width: number,
  height: number,
  format: "jpeg" | "png" = "jpeg",
) {
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  });
  return format === "jpeg"
    ? canvas
        // What a phone writes: who took it, with what, and which way up.
        .withExif({
          IFD0: { Artist: "Somebody", Make: "PhoneCo", Model: "P1" },
        })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer()
    : canvas.png().toBuffer();
}

describe("the image pipeline", () => {
  it("re-encodes to WebP and drops every piece of metadata", async () => {
    const input = await picture(400, 200);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const output = await processImage(input);
    const meta = await sharp(output.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("turns the picture the way its EXIF said before forgetting it", async () => {
    // Orientation 6 is a quarter turn: 400 by 200 as stored, 200 by 400 seen.
    const output = await processImage(await picture(400, 200));
    expect([output.width, output.height]).toEqual([200, 400]);
  });

  it("bounds the longest side and never enlarges", async () => {
    const wide = await processImage(await picture(3200, 800, "png"));
    expect(wide.width).toBe(MAX_IMAGE_SIDE);
    expect(wide.height).toBe(400);

    const small = await processImage(await picture(120, 80, "png"));
    expect([small.width, small.height]).toEqual([120, 80]);
  });

  it("names the file after its own bytes", async () => {
    const input = await picture(64, 64, "png");
    const first = await processImage(input);
    const second = await processImage(input);
    expect(first.key).toMatch(/^[0-9a-f]{64}$/);
    expect(second.key).toBe(first.key);
    expect(uploadUrl(first.key)).toBe(`/api/uploads/${first.key}.webp`);
  });

  it("decides by decoding, not by what the file claims", async () => {
    await expect(
      processImage(new TextEncoder().encode("GIF89a but not really")),
    ).rejects.toMatchObject({ messageKey: "error.imageUnreadable" });

    // A truncated JPEG: the header says picture, the bytes stop short.
    const jpeg = await picture(300, 300);
    await expect(
      processImage(jpeg.subarray(0, Math.floor(jpeg.length / 3))),
    ).rejects.toMatchObject({ messageKey: "error.imageUnreadable" });
  });

  it("refuses SVG, a document rather than a picture", async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(processImage(svg)).rejects.toMatchObject({
      messageKey: "error.imageUnreadable",
    });
  });
});

describe("the upload body cap", () => {
  function streamed(size: number): Request {
    const chunk = new Uint8Array(64 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= size) return controller.close();
        const part = chunk.subarray(0, Math.min(chunk.length, size - sent));
        sent += part.length;
        controller.enqueue(part);
      },
    });
    return new Request("https://umbra.test/api/admin/uploads", {
      method: "POST",
      body,
      // @ts-expect-error `duplex` is required by undici for a streamed body.
      duplex: "half",
    });
  }

  it("reads a body up to the cap", async () => {
    expect((await cappedBytes(streamed(300_000), 300_000)).length).toBe(
      300_000,
    );
  });

  it("refuses a body one byte over, counted as it arrives", async () => {
    await expect(
      cappedBytes(streamed(300_001), 300_000, "error.imageTooLarge"),
    ).rejects.toMatchObject({ messageKey: "error.imageTooLarge" });
  });

  it("believes a declared length that says too much", async () => {
    const request = new Request("https://umbra.test/api/admin/uploads", {
      method: "POST",
      body: "x",
      headers: { "content-length": "999999999" },
    });
    await expect(cappedBytes(request, 1000)).rejects.toMatchObject({
      code: "bad_request",
    });
  });
});

describe("what the composer may send", () => {
  const key = "a".repeat(64);

  it("takes a key Umbra wrote and the words for it", () => {
    expect(imageSchema.parse({ key, alt: "  A poster  " })).toEqual({
      key,
      alt: "A poster",
    });
  });

  it("refuses anything that is not a digest, a path above all", () => {
    for (const bad of ["../../etc/passwd", "A".repeat(64), "a".repeat(63)])
      expect(imageSchema.safeParse({ key: bad, alt: "ok" }).success).toBe(
        false,
      );
  });

  it("refuses a visual without a description", () => {
    expect(imageSchema.safeParse({ key, alt: "   " }).success).toBe(false);
    expect(imageSchema.safeParse({ key }).success).toBe(false);
  });

  it("pins without a date, or until a date still to come", () => {
    expect(featureSchema.parse({})).toEqual({ until: null });
    const later = new Date(Date.now() + 86_400_000);
    expect(featureSchema.parse({ until: later.toISOString() }).until).toEqual(
      later,
    );
    expect(
      featureSchema.safeParse({ until: new Date(Date.now() - 1000) }).success,
    ).toBe(false);
  });
});

describe("whether a pin shows", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const pinned = { featured: true, published: true, featuredUntil: null };

  it("shows a pin with no end, for as long as it is there", () => {
    expect(isFeaturedNow(pinned, now)).toBe(true);
  });

  it("shows a pin until its date and not a moment after", () => {
    const until = new Date("2026-10-13T12:00:01Z");
    expect(isFeaturedNow({ ...pinned, featuredUntil: until }, now)).toBe(true);
    expect(
      isFeaturedNow({ ...pinned, featuredUntil: until }, new Date(until)),
    ).toBe(false);
  });

  it("never shows a draft or a note without a pin", () => {
    expect(isFeaturedNow({ ...pinned, published: false }, now)).toBe(false);
    expect(isFeaturedNow({ ...pinned, featured: false }, now)).toBe(false);
  });
});

describe("the uploads directory", () => {
  let directory: string;
  let uploads: typeof import("@/lib/domain/uploads");

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "umbra-uploads-"));
    process.env.UPLOADS_PATH = directory;
    process.env.DATABASE_URL ??= "postgres://umbra@localhost/unused";
    process.env.JANUS_URL ??= "https://janus.invalid";
    process.env.JANUS_APPLICATION_ID ??= "umbra-test";
    process.env.JANUS_API_KEY ??= "umbra-test";
    resetEnvCache();
    uploads = await import("@/lib/domain/uploads");
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
    delete process.env.UPLOADS_PATH;
    resetEnvCache();
  });

  it("keeps one file per picture, named after it, and reads it back", async () => {
    const input = await picture(80, 60, "png");
    const first = await uploads.storeUpload(input);
    const again = await uploads.storeUpload(input);
    expect(again.key).toBe(first.key);
    expect(await readdir(directory)).toEqual([`${first.key}.webp`]);

    expect(await uploads.describeUpload(first.key)).toEqual({
      width: 80,
      height: 60,
    });
    const opened = await uploads.openUpload(first.key);
    expect(opened?.size).toBe(
      (await stat(path.join(directory, `${first.key}.webp`))).size,
    );
    await opened?.body.cancel();
  });

  it("answers nothing for a name that is not a key", async () => {
    expect(await uploads.describeUpload("../secret")).toBeNull();
    expect(await uploads.openUpload("b".repeat(64))).toBeNull();
  });

  it("clears an interrupted write once it is a day old, and nothing younger", async () => {
    const old = path.join(directory, `${"c".repeat(64)}.webp.partial-abc`);
    const fresh = path.join(directory, `${"d".repeat(64)}.webp.partial-def`);
    await writeFile(old, "x");
    await writeFile(fresh, "x");
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await utimes(old, twoDaysAgo, twoDaysAgo);

    expect(await uploads.sweepOrphanUploads()).toBe(1);
    const left = await readdir(directory);
    expect(left).toContain(path.basename(fresh));
    expect(left).not.toContain(path.basename(old));
  });
});
