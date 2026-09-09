"use client";

import { useSyncExternalStore } from "react";

import { PlayIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useTranslator } from "@/lib/i18n/client";

const WEB = "https://app.plex.tv/desktop/";
const ANDROID =
  "https://play.google.com/store/apps/details?id=com.plexapp.android";
const IOS = "https://apps.apple.com/app/plex/id383457673";

function subscribe() {
  // The platform does not change under the visitor, so there is nothing to
  // listen to: the value is read once, on the client, and stays.
  return () => {};
}

function platformHref() {
  const agent = navigator.userAgent;
  // An iPad reports itself as a Mac, and is only told apart by the fact that it
  // is touched.
  const isIOS =
    /iPhone|iPad|iPod/.test(agent) ||
    (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);

  if (isIOS) return IOS;
  if (/Android/.test(agent)) return ANDROID;
  return WEB;
}

/**
 * Where the watching actually happens.
 *
 * Umbra is the front door, so the door has to open onto something: the web
 * player on a desktop, and on a phone the store page for the native app, which
 * is the only way to play anything there worth the name.
 *
 * The platform is read on the client because it is not in the request the page
 * was rendered from: the server snapshot is the web player, and hydration
 * swaps in the store on a phone. That order is deliberate, since the desktop
 * link works everywhere, so a visitor who taps before hydration still lands
 * somewhere usable.
 */
export function OpenPlex() {
  const t = useTranslator();
  const href = useSyncExternalStore(subscribe, platformHref, () => WEB);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="sm:w-auto sm:gap-1.5 sm:px-2.5"
      aria-label={t("nav.openPlex")}
      render={
        <a href={href} target="_blank" rel="noreferrer noopener">
          <PlayIcon className="size-5 sm:size-4" />
          <span className="sr-only sm:not-sr-only">{t("nav.openPlex")}</span>
        </a>
      }
    />
  );
}
