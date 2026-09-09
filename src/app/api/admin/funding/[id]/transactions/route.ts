import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { MAX_AMOUNT_CENTS, addTransaction } from "@/lib/domain/funding";

const schema = z.object({
  deltaCents: z.number().int().min(-MAX_AMOUNT_CENTS).max(MAX_AMOUNT_CENTS),
  note: z.string().max(200).nullish(),
});

/**
 * Manual adjustment of a funding goal.
 *
 * No payment provider is involved and no donor is recorded: this is an
 * administrative history of amounts entered by hand.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireAdmin();
    const { id } = await params;
    const { deltaCents, note } = await jsonBody(request, schema);
    return addTransaction(id, deltaCents, note);
  });
}
