/**
 * Stamp `data-desktop` on the document root when running inside the Tauri
 * shell (the caller passes `osIsTauri()` — not imported here so this stays
 * loadable outside a webview, e.g. under node:test). futuristic.css keys its
 * opaque floating-surface fallback on this attribute (section 3b): WebView2
 * does not reliably composite backdrop-filter, so the glass popover/dialog
 * fills — solid-looking only through their blur — painted see-through on
 * desktop. A plain browser (the web build, or the dev vite URL opened
 * directly) never gets the attribute and keeps the frosted glass.
 */
export function markDesktopSurface(
  root: { dataset: { desktop?: string } },
  isDesktop: boolean,
): void {
  if (isDesktop) root.dataset.desktop = "true";
  else delete root.dataset.desktop;
}
