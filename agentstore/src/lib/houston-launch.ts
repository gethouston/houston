import { SLUG_REGEX } from "@houston/agentstore-contract";

const DEFAULT_WEB_APP_URL = "https://app.gethouston.ai";

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

export function buildStoreInstallDeepLink(slug: string): string | null {
  return isValidSlug(slug) ? `houston://store/install?slug=${slug}` : null;
}

export function buildWebAppInstallUrl(slug: string): string | null {
  if (!isValidSlug(slug)) return null;
  const base = process.env.NEXT_PUBLIC_WEB_APP_URL ?? DEFAULT_WEB_APP_URL;
  return `${base}/?install=${encodeURIComponent(slug)}`;
}

export function launchStoreInstall(slug: string): void {
  const deepLink = buildStoreInstallDeepLink(slug);
  if (!deepLink || typeof document === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = deepLink;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 3000);
}
