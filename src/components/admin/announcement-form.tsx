"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CloseIcon, PlusIcon } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ANNOUNCEMENT_CATEGORIES,
  EMBED_RATIOS,
  type AnnouncementCategory,
  type EmbedRatio,
} from "@/lib/db/schema";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Writing an announcement.
 *
 * One composer for the whole of what the administration says to the community.
 * A note is a title, a body and a category; two optional blocks hang off it and
 * stay folded until they are wanted:
 *
 * - a link, for the note whose reason to exist is an address elsewhere, a
 *   fundraiser page being the case this was built for;
 * - a page set inside the note, a trailer or a map, for what reads better in
 *   place than behind a click (see ADR 0018);
 * - a question, because a poll is an announcement that expects something back,
 *   not a second kind of object with a page of its own.
 *
 * Publishing is a second button on the same form rather than a second step: a
 * note is either a draft or out there, and both are one click away. Publishing
 * is also what opens the question, so a note and its poll never disagree about
 * whether they are live.
 */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

type Pane = "write" | "preview";

/** A note already written, handed back to the composer to be corrected. */
export type EditedAnnouncement = {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  link: { url: string; label: string | null } | null;
  embed: { url: string; title: string | null; ratio: EmbedRatio } | null;
};

/**
 * With `editing`, the same composer corrects a note instead of writing one.
 *
 * The question is left out: votes already cast were cast on its wording, so a
 * poll is not rewritten under the people who answered it. Publishing is left
 * to the row, and saving keeps the note exactly as live as it was.
 */
export function AnnouncementForm({
  editing,
  cancelHref,
}: {
  editing?: EditedAnnouncement;
  /** Where "cancel" leads, the register without the note open for editing. */
  cancelHref?: string;
} = {}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [title, setTitle] = useState(editing?.title ?? "");
  const [content, setContent] = useState(editing?.content ?? "");
  const [category, setCategory] = useState<AnnouncementCategory>(
    editing?.category ?? "information",
  );
  const [pane, setPane] = useState<Pane>("write");

  const [withLink, setWithLink] = useState(Boolean(editing?.link));
  const [linkUrl, setLinkUrl] = useState(editing?.link?.url ?? "");
  const [linkLabel, setLinkLabel] = useState(editing?.link?.label ?? "");

  const [withEmbed, setWithEmbed] = useState(Boolean(editing?.embed));
  const [embedUrl, setEmbedUrl] = useState(editing?.embed?.url ?? "");
  const [embedTitle, setEmbedTitle] = useState(editing?.embed?.title ?? "");
  const [embedRatio, setEmbedRatio] = useState<EmbedRatio>(
    editing?.embed?.ratio ?? "wide",
  );

  const [withPoll, setWithPoll] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  const [busy, setBusy] = useState(false);

  const filled = options.map((option) => option.trim()).filter(Boolean);
  const linkReady = !withLink || /^https?:\/\/\S+$/.test(linkUrl.trim());
  const embedReady = !withEmbed || /^https:\/\/\S+$/.test(embedUrl.trim());
  const pollReady =
    !withPoll || (question.trim().length > 1 && filled.length >= MIN_OPTIONS);
  const ready =
    title.trim().length > 1 &&
    content.trim().length > 1 &&
    linkReady &&
    embedReady &&
    pollReady;

  function setOption(index: number, value: string) {
    setOptions((previous) =>
      previous.map((option, i) => (i === index ? value : option)),
    );
  }

  function reset() {
    setTitle("");
    setContent("");
    setPane("write");
    setWithLink(false);
    setLinkUrl("");
    setLinkLabel("");
    setWithEmbed(false);
    setEmbedUrl("");
    setEmbedTitle("");
    setEmbedRatio("wide");
    setWithPoll(false);
    setQuestion("");
    setOptions(["", ""]);
  }

  async function submit(published: boolean) {
    setBusy(true);
    try {
      const note = {
        title,
        content,
        category,
        link: withLink
          ? { url: linkUrl.trim(), label: linkLabel.trim() || null }
          : null,
        embed: withEmbed
          ? {
              url: embedUrl.trim(),
              title: embedTitle.trim() || null,
              ratio: embedRatio,
            }
          : null,
      };
      const response = await fetch(
        editing
          ? `/api/admin/announcements/${editing.id}`
          : "/api/admin/announcements",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editing
              ? note
              : {
                  ...note,
                  published,
                  poll: withPoll ? { question, options: filled } : null,
                },
          ),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      if (editing) {
        toast.success(t("admin.announcements.saved"));
        router.push(cancelHref ?? "/admin/announcements");
        router.refresh();
        return;
      }

      reset();
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

  // Base UI prints the raw value in the trigger unless it is told the labels.
  const categories = ANNOUNCEMENT_CATEGORIES.map((value) => ({
    value,
    label: t(`news.category.${value}` as TranslationKey),
  }));
  const ratios = EMBED_RATIOS.map((value) => ({
    value,
    label: t(`admin.announcements.embed.ratio.${value}`),
  }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) void submit(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {editing
            ? t("admin.announcements.edit")
            : t("admin.announcements.new")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <div className="space-y-1.5">
              <Label htmlFor="announcement-title">{t("common.title")}</Label>
              <Input
                id="announcement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="announcement-category">
                {t("admin.announcements.category")}
              </Label>
              <Select
                items={categories}
                value={category}
                onValueChange={(value) =>
                  setCategory(value as AnnouncementCategory)
                }
              >
                <SelectTrigger id="announcement-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* The body is markdown, so it is written and read in the same
              place: the preview is the very component the feed uses, which
              means what is checked here is what is published, not an
              approximation of it. */}
          <div className="space-y-1.5">
            <Label htmlFor="announcement-content">
              {t("admin.announcements.content")}
            </Label>
            <Tabs
              value={pane}
              onValueChange={(value) => setPane(value as Pane)}
            >
              <TabsList variant="line" className="self-start">
                <TabsTrigger value="write">
                  {t("admin.announcements.write")}
                </TabsTrigger>
                <TabsTrigger value="preview">
                  {t("admin.announcements.preview")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="write">
                <Textarea
                  id="announcement-content"
                  rows={8}
                  className="font-mono"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
              </TabsContent>

              <TabsContent value="preview">
                <div className="border-input min-h-44 rounded-md border px-3 py-2">
                  {content.trim() ? (
                    <Markdown content={content} className="max-w-prose" />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t("admin.announcements.preview.empty")}
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            <p className="text-muted-foreground text-xs">
              {t("admin.announcements.markdown")}
            </p>
          </div>

          <Block
            title={t("admin.announcements.link")}
            hint={t("admin.announcements.link.hint")}
            checked={withLink}
            onCheckedChange={setWithLink}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <div className="space-y-1.5">
                <Label htmlFor="announcement-link-url">
                  {t("admin.announcements.link.url")}
                </Label>
                <Input
                  id="announcement-link-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={linkUrl}
                  aria-invalid={!linkReady || undefined}
                  onChange={(event) => setLinkUrl(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="announcement-link-label">
                  {t("admin.announcements.link.label")}
                </Label>
                <Input
                  id="announcement-link-label"
                  value={linkLabel}
                  placeholder={t("common.optional")}
                  onChange={(event) => setLinkLabel(event.target.value)}
                />
              </div>
            </div>
          </Block>

          <Block
            title={t("admin.announcements.embed")}
            hint={t("admin.announcements.embed.hint")}
            checked={withEmbed}
            onCheckedChange={setWithEmbed}
          >
            <div className="space-y-1.5">
              <Label htmlFor="announcement-embed-url">
                {t("admin.announcements.embed.url")}
              </Label>
              <Input
                id="announcement-embed-url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={embedUrl}
                aria-invalid={!embedReady || undefined}
                onChange={(event) => setEmbedUrl(event.target.value)}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-1.5">
                <Label htmlFor="announcement-embed-title">
                  {t("admin.announcements.embed.title")}
                </Label>
                <Input
                  id="announcement-embed-title"
                  value={embedTitle}
                  placeholder={t("common.optional")}
                  onChange={(event) => setEmbedTitle(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="announcement-embed-ratio">
                  {t("admin.announcements.embed.ratio")}
                </Label>
                <Select
                  items={ratios}
                  value={embedRatio}
                  onValueChange={(value) => setEmbedRatio(value as EmbedRatio)}
                >
                  <SelectTrigger
                    id="announcement-embed-ratio"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ratios.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Block>

          {editing ? null : (
            <Block
              title={t("admin.announcements.poll")}
              hint={t("admin.announcements.poll.hint")}
              checked={withPoll}
              onCheckedChange={setWithPoll}
            >
              <div className="space-y-1.5">
                <Label htmlFor="poll-question">
                  {t("admin.polls.question")}
                </Label>
                <Input
                  id="poll-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                />
              </div>

              <fieldset className="mt-4 space-y-2">
                <legend className="mb-1.5 text-sm leading-none font-medium">
                  {t("admin.polls.options")}
                </legend>
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={option}
                      aria-label={`${t("admin.polls.options")} ${index + 1}`}
                      onChange={(event) => setOption(index, event.target.value)}
                    />
                    {options.length > MIN_OPTIONS ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("common.delete")} ${index + 1}`}
                        onClick={() =>
                          setOptions((previous) =>
                            previous.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <CloseIcon />
                      </Button>
                    ) : null}
                  </div>
                ))}
                {options.length < MAX_OPTIONS ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOptions((previous) => [...previous, ""])}
                  >
                    <PlusIcon />
                    {t("admin.polls.addOption")}
                  </Button>
                ) : null}
              </fieldset>
            </Block>
          )}

          {editing ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!ready || busy}>
                {t("common.save")}
              </Button>
              <Link
                href={cancelHref ?? "/admin/announcements"}
                className={buttonVariants({ variant: "ghost" })}
              >
                {t("common.cancel")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!ready || busy}>
                {t("admin.announcements.publish")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!ready || busy}
                onClick={() => void submit(false)}
              >
                {t("admin.announcements.saveDraft")}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * An optional part of the note.
 *
 * Folded away until switched on, because most notes are a title and a body and
 * a form that shows every possibility at once reads as work rather than as
 * writing. The switch is the heading, so the whole row is the target.
 */
function Block({
  title,
  hint,
  checked,
  onCheckedChange,
  children,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/60 rounded-xl border">
      <label className="flex cursor-pointer items-start gap-3 p-3">
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-muted-foreground block text-xs">{hint}</span>
        </span>
      </label>
      {checked ? (
        <div className="border-border/60 border-t p-3">{children}</div>
      ) : null}
    </div>
  );
}
