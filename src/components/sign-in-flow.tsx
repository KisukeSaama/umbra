"use client";

import { ExternalLinkIcon, SpinnerIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Plex PIN sign-in.
 *
 * Umbra opens a pin, the visitor confirms it on plex.tv, and this component
 * polls until the answer comes back. The Plex token never reaches the browser:
 * the server reads the account id with it and drops it.
 */
type Phase = "idle" | "waiting" | "pending";

const POLL_INTERVAL_MS = 2500;

export function SignInFlow({ devLoginEnabled }: { devLoginEnabled: boolean }) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [pin, setPin] = useState<{
    pinId: string;
    code: string;
    authorizeUrl: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [devUsername, setDevUsername] = useState("dev");
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/plex/pin", { method: "POST" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setPin(body);
      setPhase("waiting");
      window.open(body.authorizeUrl, "_blank", "noopener,noreferrer");
      schedulePoll(body.pinId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setBusy(false);
    }
  }

  function schedulePoll(pinId: string) {
    pollTimer.current = setTimeout(() => void claim(pinId), POLL_INTERVAL_MS);
  }

  async function claim(pinId: string) {
    try {
      const response = await fetch("/api/auth/plex/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      if (body.status === "waiting") {
        schedulePoll(pinId);
        return;
      }
      if (body.status === "pending") {
        setPhase("pending");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setPhase("idle");
      setPin(null);
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    }
  }

  async function devLogin() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: devUsername, admin: true }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      router.replace("/");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setBusy(false);
    }
  }

  if (phase === "pending") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.pending")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {t("auth.pendingHint")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("auth.subtitle")}</p>

          {phase === "idle" ? (
            <Button
              className="w-full"
              onClick={() => void start()}
              disabled={busy}
            >
              {busy ? <SpinnerIcon /> : null}
              {t("auth.signIn")}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="bg-secondary/60 rounded-lg px-4 py-3 text-center">
                <p className="text-muted-foreground text-xs">
                  {t("auth.code")}
                </p>
                <p className="font-mono text-2xl tracking-[0.35em]">
                  {pin?.code}
                </p>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                render={
                  <a
                    href={pin?.authorizeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ExternalLinkIcon />
                {t("auth.openPlex")}
              </Button>

              <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                <SpinnerIcon />
                {t("auth.waiting")}
              </p>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  if (pollTimer.current) clearTimeout(pollTimer.current);
                  setPhase("idle");
                  setPin(null);
                }}
              >
                {t("auth.restart")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {devLoginEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("auth.devLogin")}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              value={devUsername}
              onChange={(event) => setDevUsername(event.target.value)}
              aria-label={t("auth.devLogin")}
            />
            <Button
              variant="secondary"
              onClick={() => void devLogin()}
              disabled={busy}
            >
              {t("auth.signIn")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
