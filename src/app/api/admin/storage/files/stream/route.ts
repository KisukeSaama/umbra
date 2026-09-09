import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import {
  openStorageVideo,
  RangeNotSatisfiableError,
} from "@/lib/domain/storage-files";

/**
 * One video, played from the explorer.
 *
 * Not wrapped in `route()`: the answer is bytes, not JSON. The file is served
 * as it is on disk, with range requests so the player can seek; whether the
 * browser can decode it is the browser's answer, and the player says when it
 * cannot. Umbra never transcodes, the media server next door already does.
 */

const pathSchema = z.array(z.string().min(1).max(255)).max(32);

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const params = request.nextUrl.searchParams;
    const volume = params.get("volume") ?? "";
    const name = params.get("name") ?? "";
    const path = pathSchema.parse(params.getAll("path"));

    const stream = await openStorageVideo(
      volume,
      path,
      name,
      request.headers.get("range"),
    );
    return new NextResponse(stream.body, {
      status: stream.status,
      headers: stream.headers,
    });
  } catch (error) {
    if (error instanceof RangeNotSatisfiableError)
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${error.size}` },
      });
    return errorResponse(error);
  }
}
