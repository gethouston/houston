"use client";

import { Button } from "@houston-ai/core";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function currentTheme(): Theme {
  const el = document.documentElement.dataset.theme;
  return el === "dark" || el === "light" ? el : systemTheme();
}

/**
 * Light/dark switch. The blocking ThemeScript sets the initial palette; this only
 * toggles and persists the choice. Rendered as a stable, labeled button so there
 * is no hydration mismatch and the control is always visible (never hover-gated).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = (theme ?? currentTheme()) === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persistence is a nicety; the in-page toggle still works without storage.
    }
  }

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {theme === null ? (
        <Sun aria-hidden className="size-4" />
      ) : isDark ? (
        <Moon aria-hidden className="size-4" />
      ) : (
        <Sun aria-hidden className="size-4" />
      )}
    </Button>
  );
}
