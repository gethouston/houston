export type PlatformOs = "macos" | "windows" | "linux" | "unknown";

export function detectPlatformOs(
  platform: string | undefined | null,
  userAgent: string | undefined | null,
): PlatformOs {
  const source = (platform?.trim() || userAgent?.trim() || "").toLowerCase();
  if (/mac|darwin/.test(source)) return "macos";
  if (/win/.test(source)) return "windows";
  if (/linux|x11/.test(source)) return "linux";
  return "unknown";
}

export function isMacPlatform(
  platform: string | undefined | null,
  userAgent: string | undefined | null,
): boolean {
  return detectPlatformOs(platform, userAgent) === "macos";
}

export const currentPlatformOs: PlatformOs =
  typeof navigator !== "undefined"
    ? detectPlatformOs(navigator.platform, navigator.userAgent)
    : "unknown";

export const isMac = currentPlatformOs === "macos";

export type MetricsPlatform = PlatformOs | "web";

export function metricsPlatform(
  isDesktopShell: boolean,
  os: PlatformOs,
): MetricsPlatform {
  return isDesktopShell ? os : "web";
}
