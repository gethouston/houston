export function openLinkOutside(
  event: { preventDefault(): void },
  url: string,
  deps: { desktop: boolean; open: (url: string) => Promise<boolean> },
): void {
  if (!deps.desktop) return;
  event.preventDefault();
  void deps.open(url);
}
