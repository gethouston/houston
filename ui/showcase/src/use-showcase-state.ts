import { useCallback, useEffect, useState } from "react";

export type ShowcaseTheme = "light" | "dark";

const THEME_KEY = "houston-showcase-theme";

function readStoredTheme(): ShowcaseTheme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    // Private-mode Safari throws on localStorage. Dark is the loved baseline.
    return "dark";
  }
}

/**
 * The showcase's theme: written to `data-theme` on `<html>` (the same switch
 * the app uses), defaulting to dark and persisted across reloads. `index.html`
 * replays the stored value before first paint so there is no flash.
 */
export function useShowcaseTheme() {
  const [theme, setTheme] = useState<ShowcaseTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Non-persistent session: the in-memory state is still correct.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}

function readHash(fallback: string) {
  const id = window.location.hash.replace(/^#/, "");
  return id || fallback;
}

/**
 * The selected specimen, mirrored into the URL hash so a review link points at
 * one specimen and the back button walks the nav.
 *
 * `fallback` is the landing page: no hash, or a hash naming a page that no
 * longer exists, both land there rather than on an empty frame.
 */
export function useSpecimenRoute(ids: readonly string[], fallback: string) {
  const [id, setId] = useState(() => readHash(fallback));

  useEffect(() => {
    const onHashChange = () => setId(readHash(fallback));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [fallback]);

  const select = useCallback((next: string) => {
    window.location.hash = next;
  }, []);

  return { id: ids.includes(id) ? id : fallback, select };
}
