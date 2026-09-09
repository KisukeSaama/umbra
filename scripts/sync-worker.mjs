/**
 * Scheduled synchronisation for Umbra.
 *
 * Next has no scheduler of its own, and a cron on the host would put
 * application logic outside the application. This container simply calls the
 * sync endpoint on a loop.
 *
 * It holds no state: the endpoint is idempotent and catches up on its own, so a
 * worker that was down for a week is worth exactly one late call.
 */
const target = process.env.UMBRA_INTERNAL_URL ?? "http://web:3000";
const secret = process.env.CRON_SECRET;
const intervalMinutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? 30);
const startupDelayMs =
  Number(process.env.SYNC_STARTUP_DELAY_SECONDS ?? 45) * 1000;

if (!secret) {
  console.error("[worker] CRON_SECRET is not set");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runOnce() {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${target}/api/cron/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`[worker] sync refused status=${response.status}`, body);
      return;
    }
    console.log(
      `[worker] sync done in ${Math.round((Date.now() - startedAt) / 1000)}s`,
      JSON.stringify(body.outcomes ?? []),
    );
  } catch (error) {
    console.error("[worker] sync failed", error);
  }
}

// The web container needs a moment to migrate and answer.
await sleep(startupDelayMs);

for (;;) {
  await runOnce();
  await sleep(intervalMinutes * 60 * 1000);
}
