import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { UmbraFigure, UmbraWordmark } from "@/components/brand";
import { SignInFlow } from "@/components/sign-in-flow";
import { currentAccount } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("auth.title") };
}

export default async function SignInPage() {
  const account = await currentAccount();
  if (account) redirect("/");

  const t = await getTranslator();

  return (
    <main className="umbra-glow flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* The one screen with nothing else to say: the messenger leads, and
              carries the preload since it is the largest paint here. */}
          <UmbraFigure
            alt={t("brand.alt")}
            preload
            sizes="13rem"
            className="w-40 sm:w-52"
          />
          <UmbraWordmark forLabel={t("brand.for")} withMark={false} />
          <p className="text-muted-foreground text-sm">{t("brand.tagline")}</p>
        </div>

        <SignInFlow
          devLoginEnabled={env().DEV_LOGIN && env().NODE_ENV !== "production"}
        />
      </div>
    </main>
  );
}
