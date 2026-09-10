"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  AlertIcon,
  CheckCircleIcon,
  ErrorCircleIcon,
  InfoIcon,
  SpinnerIcon,
} from "@/components/icons";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // On a phone the tab bar owns the foot of the screen, so a toast lands
      // just above it rather than under it. The variable is zero wherever the
      // bar is not.
      mobileOffset={{ bottom: "calc(var(--umbra-tabbar) + 1rem)" }}
      icons={{
        success: <CheckCircleIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <AlertIcon className="size-4" />,
        error: <ErrorCircleIcon className="size-4" />,
        loading: <SpinnerIcon />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
