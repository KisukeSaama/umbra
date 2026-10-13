"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import { ApiError, requestError } from "@/components/client-api";
import {
  CloseIcon,
  ImageIcon,
  PlusIcon,
  SpinnerIcon,
  UploadIcon,
} from "@/components/icons";
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
  MAX_UPLOAD_BYTES,
  type AnnouncementCategory,
  type EmbedRatio,
} from "@/lib/announcements";
import { embedCodeOf, parseEmbedCode } from "@/lib/embed";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Writing an announcement.
 *
 * One composer for the whole of what the administration says to the community.
 * A note is a title, a body and a category; two optional blocks hang off it and
 * stay folded until they are wanted:
 *
 * - a visual, dropped, pasted or picked, which Umbra re-encodes and keeps
 *   itself, with the words that describe it (see ADR 0022);
 * - a link, for the note whose reason to exist is an address elsewhere, a
 *   fundraiser page being the case this was built for, and the one block a
 *   fundraiser cannot go without;
 * - a page set inside the note, a trailer or a map, for what reads better in
 *   place than behind a click (see ADR 0018);
 * - a question, because a poll is an announcement that expects something back,
 *   not a second kind of object with a page of its own;
 * - a place at the top of the home page, for the one note everybody should
 *   see, until a date or until it is taken off.
 *
 * Publishing is a second button on the same form rather than a second step: a
 * note is either a draft or out there, and both are one click away. Publishing
 * is also what opens the question, so a note and its poll never disagree about
 * whether they are live.
 */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

/**
 * An answer, with a key of its own.
 *
 * Keyed by position, removing the second of four answers made React reuse the
 * row rather than drop it: the values shifted up under the cursor and the
 * caret stayed where it was, in a field that now held somebody else's words.
 * The key belongs to the answer, so it goes with it.
 */
let optionKeys = 0;
function emptyOption() {
  optionKeys += 1;
  return { key: optionKeys, value: "" };
}

type Pane = "write" | "preview";

/** A note already written, handed back to the composer to be corrected. */
export type EditedAnnouncement = {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  link: { url: string; label: string | null } | null;
  embed: { url: string; title: string | null; ratio: EmbedRatio } | null;
  image: UploadedImage | null;
  published: boolean;
  featured: boolean;
  featuredUntil: Date | null;
};

/** A picture the upload route kept, as the composer shows and sends it. */
type UploadedImage = {
  key: string;
  url: string;
  width: number;
  height: number;
  alt?: string;
};

/** `yyyy-mm-dd` in the reader's own calendar, what a date field holds. */
function dateField(date: Date | null): string {
  if (!date) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The last moment of the day picked, where the person picking it lives. */
function endOfDay(field: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(field)) return null;
  const date = new Date(`${field}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
  const [embedCode, setEmbedCode] = useState(
    editing?.embed ? embedCodeOf(editing.embed.url, editing.embed.title) : "",
  );
  const [embedRatio, setEmbedRatio] = useState<EmbedRatio>(
    editing?.embed?.ratio ?? "wide",
  );

  const [image, setImage] = useState<UploadedImage | null>(
    editing?.image ?? null,
  );
  const [imageAlt, setImageAlt] = useState(editing?.image?.alt ?? "");
  const [withImage, setWithImage] = useState(Boolean(editing?.image));
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // A draft is shown to nobody, so the pin is only offered to a note that is,
  // or is about to be, published.
  const canFeature = !editing || editing.published;
  // Read once: the earliest end a pin may be given, today included.
  const [today] = useState(() => dateField(new Date()));
  const [withFeature, setWithFeature] = useState(Boolean(editing?.featured));
  const [featureUntil, setFeatureUntil] = useState(
    dateField(editing?.featuredUntil ?? null),
  );

  const [withPoll, setWithPoll] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(() => [emptyOption(), emptyOption()]);

  const [busy, setBusy] = useState(false);

  const filled = options.map((option) => option.value.trim()).filter(Boolean);
  // A fundraiser is a note pointing at its page: the link is not optional.
  const funding = category === "funding";
  const linkOn = withLink || funding;
  const linkReady = !linkOn || /^https?:\/\/\S+$/.test(linkUrl.trim());
  const imageReady =
    !withImage || (image !== null && imageAlt.trim().length > 1 && !uploading);
  const untilDate = endOfDay(featureUntil);
  const featureReady =
    !withFeature ||
    featureUntil === "" ||
    (untilDate !== null && featureUntil >= today);
  const embedReady = !withEmbed || parseEmbedCode(embedCode) !== null;
  const pollReady =
    !withPoll || (question.trim().length > 1 && filled.length >= MIN_OPTIONS);
  const ready =
    title.trim().length > 1 &&
    content.trim().length > 1 &&
    linkReady &&
    embedReady &&
    imageReady &&
    featureReady &&
    pollReady;

  function setOption(index: number, value: string) {
    setOptions((previous) =>
      previous.map((option, i) =>
        i === index ? { ...option, value } : option,
      ),
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
    setEmbedCode("");
    setEmbedRatio("wide");
    setWithImage(false);
    setImage(null);
    setImageAlt("");
    setWithFeature(false);
    setFeatureUntil("");
    setWithPoll(false);
    setQuestion("");
    setOptions([emptyOption(), emptyOption()]);
  }

  /**
   * Sends the file as it is and shows what came back: the picture Umbra kept,
   * already resized and stripped, so the preview is what members will see.
   */
  async function upload(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(translateError(locale, "error.imageTooLarge"));
      return;
    }
    setWithImage(true);
    setUploading(true);
    try {
      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      let body: { messageKey?: string } & Partial<UploadedImage> = {};
      try {
        body = await response.json();
      } catch {
        body = {};
      }
      if (!response.ok || !body.key || !body.url)
        throw new ApiError(body.messageKey);
      setImage({
        key: body.key,
        url: body.url,
        width: body.width ?? 1,
        height: body.height ?? 1,
      });
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setUploading(false);
    }
  }

  function pickedFile(files: FileList | null | undefined): File | null {
    const file = files?.[0];
    return file && file.type.startsWith("image/") ? file : null;
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    // Whatever was dropped is sent: the server decodes it, and a file that is
    // not a picture is refused with a reason rather than ignored in silence.
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  }

  /*
   * A picture pasted anywhere in the composer is the visual: a screenshot is
   * usually on the clipboard, not in a file. Text pastes as text, since only
   * a clipboard carrying an image is taken over.
   */
  function onPaste(event: ClipboardEvent) {
    const file = pickedFile(event.clipboardData.files);
    if (!file) return;
    event.preventDefault();
    void upload(file);
  }

  async function submit(published: boolean) {
    setBusy(true);
    try {
      const note = {
        title,
        content,
        category,
        link: linkOn
          ? { url: linkUrl.trim(), label: linkLabel.trim() || null }
          : null,
        embed: withEmbed ? { code: embedCode, ratio: embedRatio } : null,
        image:
          withImage && image ? { key: image.key, alt: imageAlt.trim() } : null,
        ...(canFeature
          ? {
              featured: withFeature
                ? { until: untilDate?.toISOString() ?? null }
                : null,
            }
          : {}),
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
        <form className="space-y-5" onSubmit={onSubmit} onPaste={onPaste}>
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
            title={t("admin.announcements.image")}
            hint={t("admin.announcements.image.hint")}
            checked={withImage}
            onCheckedChange={setWithImage}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
            {image ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                <div className="bg-muted ring-foreground/10 relative overflow-hidden rounded-lg ring-1">
                  {/* Served by Umbra to signed-in readers, so the optimiser,
                      which fetches without the reader's session, is skipped. */}
                  <Image
                    src={image.url}
                    alt={imageAlt.trim() || ""}
                    width={image.width}
                    height={image.height}
                    unoptimized
                    className={cn(
                      "h-auto max-h-64 w-full object-contain",
                      uploading && "opacity-50",
                    )}
                  />
                  {uploading ? (
                    <SpinnerIcon className="absolute inset-0 m-auto size-6" />
                  ) : null}
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="announcement-image-alt">
                      {t("admin.announcements.image.alt")}
                    </Label>
                    <Input
                      id="announcement-image-alt"
                      value={imageAlt}
                      maxLength={200}
                      aria-invalid={
                        (imageAlt !== "" && imageAlt.trim().length < 2) ||
                        undefined
                      }
                      aria-describedby="announcement-image-alt-hint"
                      onChange={(event) => setImageAlt(event.target.value)}
                    />
                    <p
                      id="announcement-image-alt-hint"
                      className="text-muted-foreground text-sm"
                    >
                      {t("admin.announcements.image.altHint")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInput.current?.click()}
                    >
                      <UploadIcon />
                      {t("admin.announcements.image.replace")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploading}
                      onClick={() => setImage(null)}
                    >
                      <CloseIcon />
                      {t("admin.announcements.image.remove")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
                  dragging
                    ? "border-ring bg-accent"
                    : "border-border bg-transparent",
                )}
              >
                {uploading ? (
                  <SpinnerIcon className="text-muted-foreground size-6" />
                ) : (
                  <ImageIcon className="text-muted-foreground size-6" />
                )}
                <p className="text-sm">
                  {uploading
                    ? t("admin.announcements.image.uploading")
                    : t("admin.announcements.image.drop")}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  <UploadIcon />
                  {t("admin.announcements.image.choose")}
                </Button>
                <p className="text-muted-foreground max-w-prose text-sm">
                  {t("admin.announcements.image.formats")}
                </p>
              </div>
            )}
          </Block>

          <Block
            title={t("admin.announcements.link")}
            hint={
              funding
                ? t("admin.announcements.link.fundingRequired", {
                    label: t("news.funding.cta"),
                  })
                : t("admin.announcements.link.hint")
            }
            checked={linkOn}
            locked={funding}
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
                  placeholder={
                    funding ? t("news.funding.cta") : t("common.optional")
                  }
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
              <Label htmlFor="announcement-embed-code">
                {t("admin.announcements.embed.code")}
              </Label>
              <Textarea
                id="announcement-embed-code"
                rows={3}
                className="font-mono text-xs"
                spellCheck={false}
                placeholder='<iframe src="https://..."></iframe>'
                value={embedCode}
                aria-invalid={!embedReady || undefined}
                onChange={(event) => {
                  setEmbedCode(event.target.value);
                  // The snippet's own dimensions are the best first guess.
                  const guessed = parseEmbedCode(event.target.value)?.ratio;
                  if (guessed) setEmbedRatio(guessed);
                }}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[12rem]">
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

          {canFeature ? (
            <Block
              title={t("admin.announcements.feature")}
              hint={t("admin.announcements.feature.hint")}
              checked={withFeature}
              onCheckedChange={setWithFeature}
            >
              <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
                <div className="space-y-1.5">
                  <Label htmlFor="announcement-feature-until">
                    {t("admin.announcements.feature.until")}
                  </Label>
                  <Input
                    id="announcement-feature-until"
                    type="date"
                    value={featureUntil}
                    min={today}
                    aria-invalid={!featureReady || undefined}
                    aria-describedby="announcement-feature-until-hint"
                    onChange={(event) => setFeatureUntil(event.target.value)}
                  />
                </div>
                <p
                  id="announcement-feature-until-hint"
                  className="text-muted-foreground text-sm sm:pt-7"
                >
                  {editing
                    ? t("admin.announcements.feature.untilHint")
                    : `${t("admin.announcements.feature.untilHint")} ${t("admin.announcements.feature.draft")}`}
                </p>
              </div>
            </Block>
          ) : null}

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
                  <div key={option.key} className="flex gap-2">
                    <Input
                      value={option.value}
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
                    onClick={() =>
                      setOptions((previous) => [...previous, emptyOption()])
                    }
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
                disabled={!ready || busy || withFeature}
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
  locked = false,
  onCheckedChange,
  children,
}: {
  title: string;
  hint: string;
  checked: boolean;
  /** On and staying on: the note cannot go out without this block. */
  locked?: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/60 rounded-xl border">
      <label
        className={cn(
          "flex items-start gap-3 p-3",
          locked ? "cursor-default" : "cursor-pointer",
        )}
      >
        <Switch
          checked={checked}
          disabled={locked}
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
