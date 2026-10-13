import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import { BadRequestError } from "@/lib/errors";

/**
 * What a picture handed to Umbra becomes before it is kept.
 *
 * The staff attach a visual to a note by dropping a file in the composer, and
 * that file is whatever their phone or their screenshot tool wrote: a photo
 * with the place it was taken in its EXIF, a PNG twelve thousand pixels wide, a
 * file named `.jpg` that is something else. None of it is stored as it came.
 * The bytes are decoded, which is the only test of what a file is, then turned
 * the right way up, bounded, and written again as WebP with no metadata at all.
 * What is kept is therefore always a picture Umbra drew itself, in one format,
 * at a size a feed can afford.
 */

/** The longest side a stored visual may have. A feed column is narrower. */
export const MAX_IMAGE_SIDE = 1600;

/**
 * The formats a file may decode as. A screenshot, a photo, an exported card.
 * SVG is left out on purpose: it is a document that can carry script, and it
 * would be rasterised from markup a person wrote rather than from pixels.
 */
const ACCEPTED_FORMATS = new Set([
  "jpeg",
  "png",
  "webp",
  "gif",
  "heif",
  "avif",
]);

/**
 * The most pixels a file may decode to. A ten megabyte PNG of a flat colour
 * can claim a canvas of billions of pixels, and decoding it is what would
 * exhaust the machine that also serves the media; fifty million covers any
 * camera a member of staff owns.
 */
const MAX_INPUT_PIXELS = 50_000_000;

export type ProcessedImage = {
  /** The SHA-256 of `data`, in hex: the file's name, and its address. */
  key: string;
  data: Buffer;
  width: number;
  height: number;
};

/**
 * Decodes, orients, bounds and re-encodes one picture.
 *
 * Refused with `error.imageUnreadable` when the bytes do not decode as one of
 * the accepted formats, whatever the file was called or said it was.
 */
export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  const options = {
    limitInputPixels: MAX_INPUT_PIXELS,
    // A truncated or corrupt file is refused rather than drawn half grey.
    failOn: "error",
    // The first frame of an animation: a note's visual does not move.
    animated: false,
  } as const;

  let format: string | undefined;
  try {
    format = (await sharp(input, options).metadata()).format;
  } catch {
    throw new BadRequestError("error.imageUnreadable");
  }
  if (!format || !ACCEPTED_FORMATS.has(format))
    throw new BadRequestError("error.imageUnreadable");

  try {
    const { data, info } = await sharp(input, options)
      // Turns the picture the way its EXIF says, before the EXIF goes.
      .rotate()
      .resize({
        width: MAX_IMAGE_SIDE,
        height: MAX_IMAGE_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      // No `keepMetadata` or `withMetadata`: sharp writes none by default,
      // which is what removes the camera, the date and the coordinates.
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    return {
      key: createHash("sha256").update(data).digest("hex"),
      data,
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new BadRequestError("error.imageUnreadable");
  }
}

/** The dimensions of a file Umbra already wrote, read from its header alone. */
export async function imageSize(
  input: string | Uint8Array,
): Promise<{ width: number; height: number } | null> {
  try {
    const { width, height, format } = await sharp(input).metadata();
    if (format !== "webp" || !width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}
