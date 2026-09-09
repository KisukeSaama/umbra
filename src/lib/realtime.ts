import "server-only";

import { dbClient } from "@/lib/db";

/**
 * Live fan-out, over the database that already holds the rows.
 *
 * A notification used to be true only on the next navigation: the header
 * counted on the server and nothing told the page afterwards. What was missing
 * was not storage but a nudge, so this carries a nudge and nothing else. The
 * open streams hear that something landed for a set of accounts and go and read
 * it themselves, which keeps every authorisation check where it already is: no
 * payload travels through the channel, so a listener cannot learn about an
 * account that is not its own.
 *
 * Postgres `LISTEN`/`NOTIFY` rather than an in-process emitter, because the
 * writer and the reader are only the same process by accident today. A job, a
 * migration or a second worker writing a row still reaches every open stream,
 * and nothing has to be remembered across a restart: a stream that reconnects
 * reads its count again on arrival.
 */

const CHANNEL = "umbra_notification";

/**
 * Postgres refuses a payload over 8000 bytes, so a fan-out to everyone is sent
 * in slices. A slice of a hundred uuids is a few kilobytes at most.
 */
const IDS_PER_MESSAGE = 100;

type Listener = () => void;

/**
 * Kept on `globalThis` for the same reason as the connection pool: Next
 * reloads modules on every edit in development, and a second listener map would
 * leave the first one subscribed and deaf.
 */
const globalForRealtime = globalThis as unknown as {
  umbraNotificationListeners?: Map<string, Set<Listener>>;
  umbraNotificationSubscription?: Promise<unknown>;
};

function listeners(): Map<string, Set<Listener>> {
  return (globalForRealtime.umbraNotificationListeners ??= new Map());
}

/** The messages a fan-out becomes on the wire. Pure, so it can be tested. */
export function notificationMessages(accountIds: string[]): string[] {
  const unique = [...new Set(accountIds)];
  const messages: string[] = [];
  for (let index = 0; index < unique.length; index += IDS_PER_MESSAGE) {
    messages.push(JSON.stringify(unique.slice(index, index + IDS_PER_MESSAGE)));
  }
  return messages;
}

/**
 * Says that something landed for these accounts.
 *
 * Never throws: a stream that missed a nudge shows a stale count until the next
 * one or the next navigation, which is exactly where the bell was before. That
 * is not worth failing the write that caused it.
 */
export async function publishNotified(accountIds: string[]): Promise<void> {
  const messages = notificationMessages(accountIds);
  if (messages.length === 0) return;

  try {
    const client = dbClient();
    for (const message of messages) await client.notify(CHANNEL, message);
  } catch (error) {
    console.error("[realtime] notify failed", error);
  }
}

/**
 * Registers a stream and hands back the way to take it off again.
 *
 * The caller must call the returned function when its stream ends, otherwise
 * the map grows by one entry per page a member ever opened.
 */
export function onNotificationFor(
  accountId: string,
  listener: Listener,
): () => void {
  const map = listeners();
  const existing = map.get(accountId);
  if (existing) existing.add(listener);
  else map.set(accountId, new Set([listener]));

  ensureListening();

  return () => {
    const current = map.get(accountId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) map.delete(accountId);
  };
}

/**
 * One `LISTEN` for the whole process, opened on the first stream and kept for
 * the life of it. The driver reconnects and re-listens on its own, so a
 * database restart costs the nudges sent while it was down and nothing more.
 */
function ensureListening(): void {
  if (globalForRealtime.umbraNotificationSubscription) return;

  const subscription = dbClient().listen(CHANNEL, dispatch);
  globalForRealtime.umbraNotificationSubscription = subscription;

  // Failing to subscribe must not take the process down, and it must not leave
  // a rejected promise in place either: forgetting it lets the next stream try
  // again rather than inheriting the failure.
  subscription.catch((error: unknown) => {
    console.error("[realtime] listen failed", error);
    globalForRealtime.umbraNotificationSubscription = undefined;
  });
}

function dispatch(message: string): void {
  let accountIds: unknown;
  try {
    accountIds = JSON.parse(message);
  } catch {
    return;
  }
  if (!Array.isArray(accountIds)) return;

  const map = listeners();
  for (const accountId of accountIds) {
    for (const listener of map.get(String(accountId)) ?? []) {
      try {
        listener();
      } catch (error) {
        console.error("[realtime] listener failed", error);
      }
    }
  }
}
