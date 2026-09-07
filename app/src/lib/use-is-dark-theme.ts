import { useSyncExternalStore } from "react";

/**
 * The app's resolved theme as a boolean, live.
 *
 * The theme is expressed as `data-theme="dark"` on `<html>` (light is the
 * default, carried by the attribute being ABSENT — see `lib/theme-boot`). This
 * reads that one switch and re-reads it on every flip, so a consumer tracks the
 * user's EXPLICIT choice rather than the OS `prefers-color-scheme` (the app lets
 * a user run light while the OS is dark).
 */
function readIsDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.theme === "dark";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

/** `true` while the app is in dark mode; reacts to theme changes. */
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, readIsDark, () => false);
}
