"use client";

import {
  DisplayIcon,
  MoonIcon,
  PersonIcon,
  SignOutIcon,
  SunIcon,
} from "@/components/icons";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { LOCALES, type Locale } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

/**
 * Everything about "you" lives here: who you are, how the site looks, and the
 * way out. The header stays a navigation bar and nothing else.
 */
export function AccountMenu({
  username,
  isAdmin,
  localeOverride,
  personalisationEnabled,
}: {
  username: string;
  isAdmin: boolean;
  /** The language picked by hand, or `null` while the browser decides. */
  localeOverride: Locale | null;
  /** Whether suggestions may be shaped by an aggregated taste profile. */
  personalisationEnabled: boolean;
}) {
  const t = useTranslator();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [language, setLanguage] = useState<Locale | "auto">(
    localeOverride ?? "auto",
  );
  const [personalised, setPersonalised] = useState(personalisationEnabled);
  const [, startRefresh] = useTransition();

  const themes = [
    { value: "system", label: t("nav.theme.system"), icon: DisplayIcon },
    { value: "light", label: t("nav.theme.light"), icon: SunIcon },
    { value: "dark", label: t("nav.theme.dark"), icon: MoonIcon },
  ];

  const languages: { value: Locale | "auto"; label: string }[] = [
    { value: "auto", label: t("nav.language.auto") },
    ...LOCALES.map((locale) => ({
      value: locale,
      label: t(`nav.language.${locale}`),
    })),
  ];

  /**
   * The choice is a cookie, so the server re-renders in the new language on
   * the refresh that follows. The menu updates first: waiting for the round
   * trip would make the click feel ignored.
   */
  function chooseLanguage(value: Locale | "auto") {
    const previous = language;
    setLanguage(value);
    startRefresh(async () => {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: value }),
      });
      if (!response.ok) {
        setLanguage(previous);
        return;
      }
      router.refresh();
    });
  }

  /**
   * Turning this off deletes the profile server side, so the switch is a real
   * decision about data rather than a display preference. The optimistic flip
   * is reverted if the call fails.
   */
  function choosePersonalisation(next: boolean) {
    const previous = personalised;
    setPersonalised(next);
    startRefresh(async () => {
      const response = await fetch("/api/account/personalisation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) {
        setPersonalised(previous);
        return;
      }
      router.refresh();
    });
  }

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-3"
        aria-label={username}
      >
        <span className="border-border/70 bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-full border text-sm font-medium">
          {username.slice(0, 1).toUpperCase() || <PersonIcon />}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-foreground flex flex-col gap-0.5 text-sm">
          <span className="truncate">{username}</span>
          {isAdmin ? (
            <span className="text-muted-foreground text-xs font-normal">
              {t("admin.accounts.role.admin")}
            </span>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        {/* Picking a look keeps the menu open: the change is visible behind it,
            and a second pick is one click away rather than three. */}
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={(value) => setTheme(String(value))}
        >
          <DropdownMenuGroupLabel>{t("nav.theme")}</DropdownMenuGroupLabel>
          {themes.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick={false}
            >
              <option.icon />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        {/* Detection reads the browser, and a browser set up in the wrong
            language would otherwise leave no way out. */}
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => chooseLanguage(value as Locale | "auto")}
        >
          <DropdownMenuGroupLabel>{t("nav.language")}</DropdownMenuGroupLabel>
          {languages.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick={false}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        {/* The one switch about data rather than appearance, so it says what it
            keeps and states plainly that nothing else is kept. It stands on its
            own rather than in a group, so it takes the plain label: the group
            variant reads a context that is not there and throws. */}
        <DropdownMenuLabel>{t("account.personalisation")}</DropdownMenuLabel>
        <div className="flex items-start gap-3 px-2 py-1.5">
          <Switch
            id="personalisation"
            checked={personalised}
            onCheckedChange={(checked) => choosePersonalisation(checked)}
          />
          <label
            htmlFor="personalisation"
            className="text-muted-foreground text-xs leading-snug"
          >
            {t("account.personalisationHint")}
          </label>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onClick={() => void signOut()}>
          <SignOutIcon />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Kept next to the menu so the header can stay a server component. */
export function SignInButton() {
  const t = useTranslator();
  return (
    <Button size="sm" variant="secondary" render={<a href="/sign-in" />}>
      {t("auth.signIn")}
    </Button>
  );
}
