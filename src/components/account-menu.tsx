"use client";

import {
  CheckIcon,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

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
        className="ring-offset-background focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        aria-label={username}
      >
        <span className="border-border/70 bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-full border text-sm font-medium">
          {username.slice(0, 1).toUpperCase() || <PersonIcon />}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{username}</span>
          {isAdmin ? (
            <span className="text-muted-foreground text-xs font-normal">
              {t("admin.accounts.role.admin")}
            </span>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {t("nav.theme")}
        </DropdownMenuLabel>
        {themes.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault();
              setTheme(option.value);
            }}
          >
            <option.icon className="size-4" />
            {option.label}
            <CheckIcon
              className={cn(
                "ml-auto size-4",
                theme === option.value ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()}>
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
