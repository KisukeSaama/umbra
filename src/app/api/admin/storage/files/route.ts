import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { recordStorageSnapshot } from "@/lib/domain/storage";
import {
  deleteStorageEntries,
  listStorageDirectory,
  MAX_BATCH,
} from "@/lib/domain/storage-files";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * The explorer's two verbs.
 *
 * Reading one directory is open to the staff, the way the map is. Deleting is
 * the administrator's alone: it is the first thing in Umbra that changes the
 * machine rather than the database, and the assistants' scope is everything
 * except what cannot be taken back (see ADR 0009 and 0012).
 *
 * A path arrives as names, never as a string with separators in it, and the
 * domain checks every one of them against the volume it belongs to.
 */

const pathSchema = z.array(z.string().min(1).max(255)).max(32);

const selectionSchema = z.object({
  volume: z.string().min(1).max(200),
  path: pathSchema,
  names: z.array(z.string().min(1).max(255)).min(1).max(MAX_BATCH),
});

export async function GET(request: NextRequest) {
  return route(async () => {
    await requireStaff();
    const params = request.nextUrl.searchParams;
    const volume = params.get("volume") ?? "";
    const path = pathSchema.parse(params.getAll("path"));
    return listStorageDirectory(volume, path);
  });
}

export async function DELETE(request: NextRequest) {
  return route(async () => {
    const account = await requireAdmin();
    checkRate("storage-delete", account.id, perMinute(30));
    const { volume, path, names } = await jsonBody(request, selectionSchema);

    const result = await deleteStorageEntries(volume, path, names);

    // The gauge should say what just happened without waiting for the
    // scheduled pass. The measurement is a system call, not a walk; the map
    // is left to the next scan.
    if (result.deleted.length > 0)
      await recordStorageSnapshot().catch((error) => {
        console.warn("[storage] snapshot after deletion failed", error);
      });

    return result;
  });
}
