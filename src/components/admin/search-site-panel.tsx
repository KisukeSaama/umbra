"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ActionButton } from "@/components/admin/action-button";
import { request, requestError } from "@/components/client-api";
import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import {
  buildSearchUrl,
  SEARCH_SAMPLES,
  type SearchSiteParam,
  type SearchSiteView,
} from "@/lib/search-sites";

/**
 * Search sites, written down once.
 *
 * A site is an address, the argument carrying the search terms and the
 * arguments that never change on that page. The terms are Umbra's to write, so
 * the form only asks which argument carries them, `q` being the usual answer.
 * The examples under the form are built with the function the queues use, one
 * per case, so what is read here is what will open.
 *
 * Order is the only ranking: the first enabled site is the one on the button of
 * every request and every report.
 */

const [SAMPLE] = SEARCH_SAMPLES;

/**
 * One fixed argument, with a key of its own.
 *
 * The row cannot be keyed by its position, or removing the second of four
 * shifts the values up under the cursor while the caret stays put, and it
 * cannot be keyed by the argument's name, which is empty until it is typed.
 * The identity is the form's and is dropped before the draft is sent.
 */
type ParamRow = SearchSiteParam & { row: number };

let paramRows = 0;
function toRow(param: SearchSiteParam): ParamRow {
  paramRows += 1;
  return { ...param, row: paramRows };
}

type Draft = {
  name: string;
  url: string;
  queryParam: string;
  params: ParamRow[];
  position: number;
  enabled: boolean;
};

const EMPTY: Draft = {
  name: "",
  url: "",
  queryParam: "q",
  params: [],
  position: 0,
  enabled: true,
};

export function SearchSitePanel({ sites }: { sites: SearchSiteView[] }) {
  const t = useTranslator();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.searchSites.new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            {t("admin.searchSites.intro")}
          </p>
          <SiteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.searchSites.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("admin.searchSites.none")}
            </p>
          ) : (
            <ul className="divide-border/60 -my-3 divide-y">
              {sites.map((site) => (
                <li key={site.id} className="space-y-3 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {site.name}
                        {site.enabled ? null : (
                          <span className="text-muted-foreground font-normal">
                            {" · "}
                            {t("admin.searchSites.disabled")}
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {buildSearchUrl(site, SAMPLE) ?? site.url}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing(editing === site.id ? null : site.id)
                      }
                    >
                      {editing === site.id
                        ? t("common.cancel")
                        : t("admin.searchSites.edit")}
                    </Button>

                    <ActionButton
                      url={`/api/admin/search-sites/${site.id}`}
                      body={{ enabled: !site.enabled }}
                      size="sm"
                      variant="secondary"
                    >
                      {site.enabled
                        ? t("admin.searchSites.disable")
                        : t("admin.searchSites.enable")}
                    </ActionButton>

                    <ActionButton
                      url={`/api/admin/search-sites/${site.id}`}
                      method="DELETE"
                      size="sm"
                      variant="ghost"
                      confirmMessage={t("admin.searchSites.deleteConfirm", {
                        name: site.name,
                      })}
                    >
                      <TrashIcon />
                      {t("common.delete")}
                    </ActionButton>
                  </div>

                  {editing === site.id ? (
                    <SiteForm site={site} onDone={() => setEditing(null)} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Creation when `site` is absent, edition otherwise. */
function SiteForm({
  site,
  onDone,
}: {
  site?: SearchSiteView;
  onDone?: () => void;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(site ? toDraft(site) : EMPTY);
  const [busy, setBusy] = useState(false);

  const patch = (values: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...values }));

  const previews = SEARCH_SAMPLES.flatMap((sample) => {
    const url = buildSearchUrl(draft, sample);
    return url ? [url] : [];
  });
  const ready =
    draft.name.trim().length > 0 &&
    draft.queryParam.trim().length > 0 &&
    previews.length > 0;

  async function save() {
    setBusy(true);
    try {
      await request(
        site ? `/api/admin/search-sites/${site.id}` : "/api/admin/search-sites",
        {
          method: site ? "PATCH" : "POST",
          // Without the row identity, which is the form's business alone.
          body: {
            ...draft,
            params: draft.params.map(({ key, value }) => ({ key, value })),
          },
        },
      );
      if (!site) setDraft(EMPTY);
      toast.success(t("admin.searchSites.saved"));
      onDone?.();
      router.refresh();
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setBusy(false);
    }
  }

  const id = (field: string) => `search-site-${site?.id ?? "new"}-${field}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor={id("name")}>{t("admin.searchSites.name")}</Label>
          <Input
            id={id("name")}
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("position")}>
            {t("admin.searchSites.position")}
          </Label>
          <Input
            id={id("position")}
            inputMode="numeric"
            value={String(draft.position)}
            onChange={(event) =>
              patch({ position: Number(event.target.value) || 0 })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("url")}>{t("admin.searchSites.url")}</Label>
        <Input
          id={id("url")}
          value={draft.url}
          placeholder="https://example.org/search"
          onChange={(event) => patch({ url: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("param")}>{t("admin.searchSites.queryParam")}</Label>
        <Input
          id={id("param")}
          className="sm:w-40"
          value={draft.queryParam}
          placeholder="q"
          onChange={(event) => patch({ queryParam: event.target.value })}
        />
        <p className="text-muted-foreground text-xs">
          {t("admin.searchSites.queryParamHint")}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t("admin.searchSites.params")}</Label>
        {draft.params.map((param, index) => (
          <div
            key={param.row}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
          >
            <Input
              value={param.key}
              aria-label={t("admin.searchSites.paramKey")}
              placeholder={t("admin.searchSites.paramKey")}
              onChange={(event) =>
                patch({
                  params: draft.params.map((entry, position) =>
                    position === index
                      ? { ...entry, key: event.target.value }
                      : entry,
                  ),
                })
              }
            />
            <Input
              value={param.value}
              aria-label={t("admin.searchSites.paramValue")}
              placeholder={t("admin.searchSites.paramValue")}
              onChange={(event) =>
                patch({
                  params: draft.params.map((entry, position) =>
                    position === index
                      ? { ...entry, value: event.target.value }
                      : entry,
                  ),
                })
              }
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("admin.searchSites.removeParam")}
              onClick={() =>
                patch({
                  params: draft.params.filter(
                    (_entry, position) => position !== index,
                  ),
                })
              }
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            patch({
              params: [...draft.params, toRow({ key: "", value: "" })],
            })
          }
        >
          {t("admin.searchSites.addParam")}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id={id("enabled")}
          checked={draft.enabled}
          onCheckedChange={(checked) => patch({ enabled: checked })}
        />
        <Label htmlFor={id("enabled")}>{t("admin.searchSites.enabled")}</Label>
      </div>

      {previews.length > 0 ? (
        <div className="text-muted-foreground space-y-1 text-xs break-all">
          <p>{t("admin.searchSites.preview")}</p>
          <ul className="space-y-0.5">
            {previews.map((url) => (
              <li key={url}>{url}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button disabled={!ready || busy} onClick={() => void save()}>
          {t("common.save")}
        </Button>
        {onDone ? (
          <Button variant="ghost" disabled={busy} onClick={onDone}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function toDraft(site: SearchSiteView): Draft {
  return {
    name: site.name,
    url: site.url,
    queryParam: site.queryParam,
    params: site.params.map(toRow),
    position: site.position,
    enabled: site.enabled,
  };
}
