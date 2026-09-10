import Link from "next/link";

import { UmbraMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { getTranslator } from "@/lib/i18n/server";

/**
 * A wrong address inside the community, which is not the same thing as a wrong
 * address on the site.
 *
 * `notFound()` from a page under this layout used to render the root screen,
 * outside the gate: the header, the nav and the way to anywhere else vanished
 * along with the title that did not exist. The same words are said here, inside
 * the layout, so a member who followed a stale link is still somewhere.
 */
export default async function SiteNotFound() {
  const t = await getTranslator();

  return (
    <div className="umbra-container flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
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
    </div>
  );
}
