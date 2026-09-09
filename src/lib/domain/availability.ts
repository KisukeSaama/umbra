/**
 * The four states a title can be in, decided in one place.
 *
 * A result is always in exactly one of them, and that state decides both the
 * wording and whether the request button exists at all. `partial` exists
 * because the other three made the search lie: a series the server holds three
 * seasons of answered "available on the server" exactly like one it holds
 * whole, and a member had to open the page to find out.
 *
 * Pure on purpose: search, the title page and the write guards all read the
 * same rule, so no screen can promise something a route would refuse.
 */
export type Availability = "available" | "partial" | "requested" | "absent";

export function availabilityOf({
  inLibrary,
  incomplete = false,
  requested = false,
}: {
  /** The server holds the title, whole or in part. */
  inLibrary: boolean;
  /** Known to be missing something. Unknown means whole, never partial. */
  incomplete?: boolean;
  /** A request that has not been rejected already exists. */
  requested?: boolean;
}): Availability {
  if (inLibrary) return incomplete ? "partial" : "available";
  if (requested) return "requested";
  return "absent";
}

/**
 * On the server, whole or in part.
 *
 * What every rule about presence actually means: a title cannot be requested
 * again, and it can be reported. Missing episodes are asked for through the
 * update ask, not through a second request for the whole series.
 */
export function isOnServer(availability: Availability): boolean {
  return availability === "available" || availability === "partial";
}
