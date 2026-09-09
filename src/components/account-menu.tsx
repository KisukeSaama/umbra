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
import { useState } from "react";

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
import { useTranslator } from "@/lib/i18n/client";

/**
 * Everything about "you" lives here: who you are, how the site looks, and the
 * way out. The header stays a navigation bar and nothing else.
 */
export function AccountMenu({
  username,
  isAdmin,
}: {
  username: string;
  isAdmin: boolean;
}) {
  const t = useTranslator();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  const themes = [
    { value: "system", label: t("nav.theme.system"), icon: DisplayIcon },
    { value: "light", label: t("nav.theme.light"), icon: SunIcon },
    { value: "dark", label: t("nav.theme.dark"), icon: MoonIcon },
  ];

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
