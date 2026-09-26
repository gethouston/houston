/**
 * A click on a link to a page outside the app. The desktop webview opens no
 * new windows, so there the click goes to the OS browser instead; the web
 * keeps the anchor's own `target="_blank"` open, which the browser allows
 * because it happens inside the click itself.
 */
export function openLinkOutside(
  event: { preventDefault(): void },
  url: string,
  deps: { desktop: boolean; open: (url: string) => Promise<boolean> },
): void {
  if (!deps.desktop) return;
  event.preventDefault();
  void deps.open(url);
}
