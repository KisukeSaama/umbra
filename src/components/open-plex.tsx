"use client";

import { useSyncExternalStore, type MouseEvent } from "react";

import { PlayIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useTranslator } from "@/lib/i18n/client";

const WEB = "https://app.plex.tv/desktop/";
const IOS_APP = "plex://";
const IOS_STORE = "https://apps.apple.com/app/plex/id383457673";
const ANDROID_STORE =
  "https://play.google.com/store/apps/details?id=com.plexapp.android";
// An intent URL opens the installed app and lets Android itself fall back to
// the store when it is missing, so no timer is needed there.
const ANDROID = `intent://#Intent;package=com.plexapp.android;S.browser_fallback_url=${encodeURIComponent(ANDROID_STORE)};end`;

// How long the page waits for iOS to hand over to the app before assuming it
// is not installed.
const IOS_FALLBACK_DELAY_MS = 1500;

type Platform = "ios" | "android" | "web";

function subscribe() {
  // The platform does not change under the visitor, so there is nothing to
  // listen to: the value is read once, on the client, and stays.
  return () => {};
}

function detectPlatform(): Platform {
  const agent = navigator.userAgent;
  // An iPad reports itself as a Mac, and is only told apart by the fact that it
  // is touched.
  const isIOS =
    /iPhone|iPad|iPod/.test(agent) ||
    (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);

  if (isIOS) return "ios";
  if (/Android/.test(agent)) return "android";
  return "web";
}

const HREF: Record<Platform, string> = {
  ios: IOS_APP,
  android: ANDROID,
  web: WEB,
};

/**
 * iOS has no intent URL: the custom scheme opens the app when it is installed,
 * and the page goes to the background. If the page is still visible after a
 * short delay, the app is not there and the store takes over.
 */
function openOnIOS(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();

  const fallback = window.setTimeout(() => {
    if (document.visibilityState === "visible") {
      window.location.href = IOS_STORE;
    }
  }, IOS_FALLBACK_DELAY_MS);
  const cancel = () => {
    if (document.visibilityState === "hidden") window.clearTimeout(fallback);
  };
  document.addEventListener("visibilitychange", cancel, { once: true });
  window.addEventListener("pagehide", () => window.clearTimeout(fallback), {
    once: true,
  });

  window.location.href = IOS_APP;
}

/**
 * Where the watching actually happens.
 *
 * Umbra is the front door, so the door has to open onto something: the web
 * player on a desktop, and on a phone the native app, which is the only way to
 * play anything there worth the name. When the app is missing, the phone lands
 * on its store page instead.
 *
 * The platform is read on the client because it is not in the request the page
 * was rendered from: the server snapshot is the web player, and hydration
 * swaps in the app on a phone. That order is deliberate, since the desktop
 * link works everywhere, so a visitor who taps before hydration still lands
 * somewhere usable.
 */
export function OpenPlex() {
  const t = useTranslator();
  const platform = useSyncExternalStore<Platform>(
    subscribe,
    detectPlatform,
    () => "web",
  );
  const external = platform === "web";

  // The word travels with the triangle at every width. It is the way out to
  // the thing people actually came for, and an unlabelled triangle in a header
  // is a guess for anyone who has not learnt it. A phone gets the short form.
  return (
    <Button
      variant="ghost"
      className="gap-1.5 px-2.5"
      render={
        <a
          href={HREF[platform]}
          onClick={platform === "ios" ? openOnIOS : undefined}
          {...(external
            ? { target: "_blank", rel: "noreferrer noopener" }
            : {})}
        >
          <PlayIcon />
          <span className="sm:hidden">{t("nav.openPlexShort")}</span>
          <span className="hidden sm:inline">{t("nav.openPlex")}</span>
        </a>
      }
    />
  );
}
