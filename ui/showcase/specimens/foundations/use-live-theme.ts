import { useEffect, useState } from "react";

/**
 * `rgb(238, 241, 247)` → `#eef1f7`.
 *
 * Everything else is returned exactly as the stylesheet wrote it: a token that
 * IS an `rgba(...)` stays `rgba(...)` (the alpha is the point — half of the
 * surface ladder is translucent glass), `transparent` stays `transparent`, and
 * a hex stays a hex. Only the opaque `rgb()` form is converted, because that
 * is the form a browser hands back and nobody reads a colour that way.
 */
export function displayValue(raw: string): string {
  const value = raw.trim();
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/.exec(
    value,
  );
  if (!rgb) return value;
  const hex = rgb
    .slice(1, 4)
    .map((channel) => Math.round(Number(channel)).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

/**
 * Runs `read` now, and again on every flip of `data-theme` on `<html>` — the
 * one switch the whole product themes off. Returns the teardown, so it drops
 * straight into a `useEffect`.
 *
 * A MutationObserver rather than the showcase's own theme state threaded down:
 * this page documents the CSS, so it watches the CSS's own trigger and stays
 * right even when a reviewer flips the attribute by hand in devtools.
 */
function onThemeChange(read: () => void): () => void {
  read();
  const observer = new MutationObserver(read);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

/**
 * The LIVE value of every `--ht-*` token named, read off the document with
 * `getComputedStyle` and re-read the instant the theme flips.
 *
 * Empty before the first effect runs (server rendering, and the very first
 * client paint), so a row always renders its plain-English name and its CSS
 * variable first and fills the value in — never the other way round.
 */
export function useTokenValues(
  names: readonly string[],
): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(
    () =>
      onThemeChange(() => {
        const style = getComputedStyle(document.documentElement);
        setValues(
          Object.fromEntries(
            names.map((name) => [
              name,
              displayValue(style.getPropertyValue(`--ht-${name}`)),
            ]),
          ),
        );
      }),
    [names],
  );
  return values;
}

/** Reads `data-theme` without assuming a DOM — server rendering has none. */
function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * The theme the page is being read in. The aurora is a dark-only effect, so
 * the Effects block has to say which half of the story the reader is looking
 * at, rather than showing an empty box with no explanation.
 */
export function useThemeName(): "light" | "dark" {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => onThemeChange(() => setTheme(readTheme())), []);
  return theme;
}
