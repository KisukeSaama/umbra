import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { canReadUpload, openUpload } from "@/lib/domain/uploads";
import { NotFoundError } from "@/lib/errors";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * The visual of a note, served by Umbra itself.
 *
 * Members only, like every page that shows one, and a member only reaches the
 * picture of a published note (`canReadUpload`). The name is the digest of the
 * file, so what an address serves never changes: the browser keeps it for a
 * year without asking again. `private`, because the answer depends on who
 * asks, and a cache in front of Umbra must not hand it to whoever comes next.
 *
 * Not wrapped in `route()`: the answer is bytes, not JSON.
 */

const NAME = /^([0-9a-f]{64})\.webp$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const account = await requireMember();
    // A feed page asks for a handful at once and the browser keeps them; the
    // bucket bounds a loop, not a reader.
    checkRate("uploads-read", account.id, perMinute(300));

    const key = NAME.exec((await params).name)?.[1];
    if (!key || !(await canReadUpload(key, account))) throw new NotFoundError();

    const file = await openUpload(key);
    if (!file) throw new NotFoundError();

    return new NextResponse(file.body, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(file.size),
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${key}"`,
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
