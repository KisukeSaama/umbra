import { NextRequest } from "next/server";

import { cappedBytes, route } from "@/lib/api";
import { MAX_UPLOAD_BYTES, uploadUrl } from "@/lib/announcements";
import { requireStaff } from "@/lib/auth/session";
import { isCrossSiteMutation } from "@/lib/csrf";
import { storeUpload } from "@/lib/domain/uploads";
import { ForbiddenError } from "@/lib/errors";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * A visual for a note, sent by the composer as the bare file.
 *
 * The body is the picture's bytes and nothing else: a multipart form would be
 * read whole by the platform before anything here could weigh it, whereas a
 * raw body is counted as it arrives and dropped past ten megabytes. What the
 * file claims to be, by its name or its content type, is not read at all; the
 * decoder decides (`src/lib/images.ts`).
 *
 * This route is the one path of `/api` that `src/proxy.ts` does not run on, so
 * that the proxy's small body limit does not cut a picture short. The
 * cross-site check it would have made is therefore made here, before anything
 * else, with the same function.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    if (isCrossSiteMutation(request.method, request.headers))
      throw new ForbiddenError();
    const account = await requireStaff();
    // Shares the administration bucket, with less room: each call is a decode
    // and an encode on the machine that also serves the media.
    checkRate("admin", account.id, perMinute(10));

    const bytes = await cappedBytes(
      request,
      MAX_UPLOAD_BYTES,
      "error.imageTooLarge",
    );
    const stored = await storeUpload(bytes);
    return { ...stored, url: uploadUrl(stored.key) };
  });
}
