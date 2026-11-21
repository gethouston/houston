export function markDesktopSurface(
  root: { dataset: { desktop?: string } },
  isDesktop: boolean,
): void {
  if (isDesktop) root.dataset.desktop = "true";
  else delete root.dataset.desktop;
}
