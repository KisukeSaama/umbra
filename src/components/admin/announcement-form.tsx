"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ANNOUNCEMENT_CATEGORIES,
  type AnnouncementCategory,
} from "@/lib/db/schema";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Writing an announcement.
 *
 * Publishing is a checkbox on the same form rather than a second step: an
 * announcement is either a draft or out there, and both are one click away.
 */
export function AnnouncementForm() {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("information");
  const [busy, setBusy] = useState(false);

  async function submit(published: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, category, published }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setTitle("");
      setContent("");
      toast.success(
        published
          ? t("admin.announcements.published")
          : t("admin.announcements.draft"),
      );
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

  const ready = title.trim().length > 1 && content.trim().length > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.announcements.new")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
          <div className="space-y-1.5">
            <Label htmlFor="announcement-title">{t("news.title")}</Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="announcement-category">
              {t("news.category.information")}
            </Label>
            <Select
              value={category}
              onValueChange={(value) =>
                setCategory(value as AnnouncementCategory)
              }
            >
              <SelectTrigger id="announcement-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANNOUNCEMENT_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`news.category.${value}` as TranslationKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="announcement-content">
            {t("section.announcement")}
          </Label>
          <Textarea
            id="announcement-content"
            rows={5}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button disabled={!ready || busy} onClick={() => void submit(true)}>
            {t("admin.announcements.publish")}
          </Button>
          <Button
            variant="secondary"
            disabled={!ready || busy}
            onClick={() => void submit(false)}
          >
            {t("admin.announcements.draft")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
