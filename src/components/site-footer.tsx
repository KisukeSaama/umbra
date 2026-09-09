import { UmbraMark } from "@/components/brand";
import { getTranslator } from "@/lib/i18n/server";

export async function SiteFooter() {
  const t = await getTranslator();

  return (
    <footer className="border-border/60 mt-20 border-t py-10">
      <div className="umbra-container flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <UmbraMark className="size-6" />
          <div className="space-y-1">
            <p className="text-sm font-medium tracking-[0.18em] uppercase">
              Umbra{" "}
              <span className="text-muted-foreground">{t("brand.for")}</span>
            </p>
            <p className="text-muted-foreground text-sm">{t("footer.plex")}</p>
          </div>
        </div>

        <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">
          {t("footer.tmdb")}
        </p>
      </div>
    </footer>
  );
}
