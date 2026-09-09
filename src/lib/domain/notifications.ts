import "server-only";

import { env } from "@/lib/env";

/**
 * Admin notifications.
 *
 * One channel in V1 (Discord webhook) behind an interface, so adding e-mail or
 * web push later will not touch the callers.
 *
 * A failing notification never fails the business action: a recorded request
 * stays recorded even when Discord is down.
 */

export type NotificationKind = "request" | "episode" | "system";

export type Notification = {
  kind: NotificationKind;
  title: string;
  body?: string;
};

export interface NotificationChannel {
  readonly name: string;
  send(notification: Notification): Promise<void>;
}

/**
 * A Discord webhook carries its own secret in the URL, so there is no key to
 * hand to Janus and the call goes out directly (see `docs/adr/0004`).
 */
const discordChannel: NotificationChannel = {
  name: "discord",
  async send(notification) {
    const url = env().DISCORD_WEBHOOK_URL;
    if (!url) return;

    const content = notification.body
      ? `**${notification.title}**\n${notification.body}`
      : `**${notification.title}**`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Discord answered ${response.status}`);
  },
};

function channels(): NotificationChannel[] {
  return env().DISCORD_WEBHOOK_URL ? [discordChannel] : [];
}

export async function notify(notification: Notification) {
  await Promise.all(
    channels().map(async (channel) => {
      try {
        await channel.send(notification);
      } catch (error) {
        console.error(`[notifications] channel ${channel.name} failed`, error);
      }
    }),
  );
}
