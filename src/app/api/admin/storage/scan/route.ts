import { route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { recordStorageSnapshot, scanStorageTree } from "@/lib/domain/storage";

/**
 * Measures the disk now.
 *
 * The scheduled pass walks the volumes a few times a day, which is the right
 * cadence for a number that moves with what arrives. This is the button for the
 * moment after a large deletion, when waiting six hours to see the result is
 * the wrong answer.
 */
export async function POST() {
  return route(async () => {
    await requireStaff();
    await recordStorageSnapshot();
    const tree = await scanStorageTree();
    return {
      scannedAt: tree?.scannedAt ?? null,
      fileCount: tree?.fileCount ?? 0,
      durationMs: tree?.durationMs ?? 0,
    };
  });
}

/** A walk over a full media library is measured in minutes, not seconds. */
export const maxDuration = 300;
