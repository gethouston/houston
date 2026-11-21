declare global {
  interface Window {
    __HOUSTON_APP_VERSION__?: string;
  }
}

export function appVersionHeader(): string | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_APP_VERSION__ ?? null;
}
