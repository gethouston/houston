import { useSyncExternalStore } from "react";

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

export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, readIsDark, () => false);
}
