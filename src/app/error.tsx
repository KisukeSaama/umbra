"use client";

import Link from "next/link";
import { useEffect } from "react";

import { UmbraMark } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { useTranslator } from "@/lib/i18n/client";

/**
 * Something threw while rendering. The detail goes to the server log, never to
 * the screen: a member has nothing to do with a stack trace.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslator();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <UmbraMark className="mb-6 size-12" />
      <h1 className="text-3xl tracking-tight text-balance sm:text-4xl">
        {t("error.title")}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        {t("error.hint")}
      </p>
      <div className="mt-8 flex gap-2">
        <Button onClick={reset}>{t("common.retry")}</Button>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          {t("common.home")}
        </Link>
      </div>
    </main>
  );
}
