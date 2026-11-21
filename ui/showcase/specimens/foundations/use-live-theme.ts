import { useEffect, useState } from "react";

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

function onThemeChange(read: () => void): () => void {
  read();
  const observer = new MutationObserver(read);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

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

function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function useThemeName(): "light" | "dark" {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => onThemeChange(() => setTheme(readTheme())), []);
  return theme;
}
