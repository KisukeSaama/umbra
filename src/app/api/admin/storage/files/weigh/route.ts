import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { MAX_BATCH, weighStorageEntries } from "@/lib/domain/storage-files";

/**
 * What a selection weighs, asked when the confirmation opens.
 *
 * A listing does not measure directories, because that is a walk and a walk
 * belongs to the scan. Here it is bounded, once, for the moment the figure is
 * the whole point of the dialog.
 */

const schema = z.object({
  volume: z.string().min(1).max(200),
  path: z.array(z.string().min(1).max(255)).max(32),
  names: z.array(z.string().min(1).max(255)).min(1).max(MAX_BATCH),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    await requireStaff();
    const { volume, path, names } = await jsonBody(request, schema);
    return weighStorageEntries(volume, path, names);
  });
}
