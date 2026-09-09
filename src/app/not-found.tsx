import Link from "next/link";

import { UmbraMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { getTranslator } from "@/lib/i18n/server";

/** A wrong address. The messenger is still here, and so is the way home. */
export default async function NotFound() {
  const t = await getTranslator();

  return (
    <main className="umbra-glow flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <UmbraMark className="mb-6 size-12" />
      <h1 className="text-3xl tracking-tight text-balance sm:text-4xl">
        {t("notFound.title")}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        {t("notFound.hint")}
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-8" })}>
        {t("common.home")}
      </Link>
    </main>
  );
}
