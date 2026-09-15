"use client";

import { useId, useState } from "react";
import { SearchSiteButtons } from "@/components/admin/search-site-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslator } from "@/lib/i18n/client";
import {
  searchableTitle,
  searchLinksFor,
  type SearchSiteView,
} from "@/lib/search-sites";
import { storageSearchTitle } from "@/lib/storage-search";

/** Remounted on navigation so an edited query never follows another folder. */
export function StorageSearch({
  path,
  sites,
}: {
  path: string[];
  sites: SearchSiteView[];
}) {
  const t = useTranslator();
  const id = useId();
  const [title, setTitle] = useState(() => storageSearchTitle(path));
  if (sites.length === 0 || path.length === 0) return null;
  const links = searchableTitle(title)
    ? searchLinksFor(sites, { kind: "tv", title })
    : [];
  return (
    <div className="space-y-1.5 py-1">
      <Label htmlFor={id}>{t("admin.storage.searchTitle")}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-8 flex-1 basis-48"
          autoComplete="off"
        />
        <SearchSiteButtons links={links} />
      </div>
    </div>
  );
}
