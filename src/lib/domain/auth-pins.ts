import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { authPins } from "@/lib/db/schema";
import { BadRequestError } from "@/lib/errors";
import { authorizeUrl, createPin } from "@/lib/providers/plex-tv";

/**
 * The pins a sign-in goes through.
 *
 * A pin is opened here rather than named by the caller, which is the whole
 * point of the table: the confirmation step can then only be pointed at a pin
 * Umbra itself opened, never at an arbitrary one on plex.tv. Kept in the domain
 * layer because it is a rule about rows, and `src/app/api` holds no SQL (see
 * `docs/architecture.md`).
 */

/** plex.tv pins are short-lived, and ours expire with them. */
const PIN_TTL_MS = 15 * 60 * 1000;

export type OpenedPin = {
  /** Umbra's own id for the pin, which is what the browser comes back with. */
  pinId: string;
  /** The code the visitor types on plex.tv. */
  code: string;
  authorizeUrl: string;
};

export async function openPin(): Promise<OpenedPin> {
  const pin = await createPin();

  const [row] = await db()
    .insert(authPins)
    .values({
      plexPinId: pin.id,
      expiresAt: new Date(Date.now() + PIN_TTL_MS),
    })
    .returning({ id: authPins.id });

  return {
    pinId: row.id,
    code: pin.code,
    authorizeUrl: authorizeUrl(pin.code),
  };
}

/**
 * The plex.tv pin behind one of ours, if it is still worth asking about.
 *
 * Refuses anything already used or out of time, so a pin is polled while the
 * visitor is validating it and is worth nothing afterwards.
 */
export async function livePin(pinId: string): Promise<{ plexPinId: string }> {
  const [pin] = await db()
    .select({ plexPinId: authPins.plexPinId })
    .from(authPins)
    .where(
      and(
        eq(authPins.id, pinId),
        isNull(authPins.consumedAt),
        gt(authPins.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!pin) throw new BadRequestError("error.invalidPin");
  return pin;
}

/** Spends a pin. Whatever happens next, it is not usable a second time. */
export async function consumePin(pinId: string): Promise<void> {
  await db()
    .update(authPins)
    .set({ consumedAt: new Date() })
    .where(eq(authPins.id, pinId));
}
