import { useCallback, useEffect, useState } from "react";

export type ShowcaseTheme = "light" | "dark";

const THEME_KEY = "houston-showcase-theme";

function readStoredTheme(): ShowcaseTheme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function useShowcaseTheme() {
  const [theme, setTheme] = useState<ShowcaseTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
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
