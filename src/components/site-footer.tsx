import Image from "next/image";

import tmdbLogo from "@/assets/tmdb-logo.svg";
import { UmbraMark } from "@/components/brand";
import { getTranslator } from "@/lib/i18n/server";

export async function SiteFooter() {
  const t = await getTranslator();

  return (
    <footer className="border-border/60 mt-20 border-t py-10">
      <div className="umbra-container flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <UmbraMark className="size-8" />
          <div className="space-y-1">
            <p className="text-sm font-medium tracking-[0.18em] uppercase">
              Umbra{" "}
              <span className="text-muted-foreground">{t("brand.for")}</span>
            </p>
            <p className="text-muted-foreground text-sm">{t("footer.plex")}</p>
          </div>
        </div>

        {/*
         * TMDB's terms ask for their approved logo, kept smaller than Umbra's own
         * mark, next to a fixed notice, inside a section named as credits.
         */}
        <section aria-labelledby="footer-credits" className="max-w-sm space-y-2">
          <h2
            id="footer-credits"
            className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase"
          >
            {t("footer.credits")}
          </h2>
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <Image
              src={tmdbLogo}
              alt={t("footer.tmdbLogo")}
              className="h-3 w-auto"
            />
          </a>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("footer.tmdb")}
          </p>
        </section>
      </div>
    </footer>
  );
}
