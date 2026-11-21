export const SETTINGS_SECTION_IDS = [
  "plan",
  "apiKeys",
  "channels",
  "morningBriefing",
  "shortcuts",
  "reportBug",
  "migration",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export function parseSettingsSection(
  value: string | null,
): SettingsSectionId | null {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSectionId)
    ? (value as SettingsSectionId)
    : null;
}

export function settingsSectionFromPath(
  path: string,
): SettingsSectionId | null {
  const match = /^\/settings\/([^/]+)\/?$/.exec(path);
  return match ? parseSettingsSection(match[1]) : null;
}

export function settingsSectionFromDeepLink(
  value: string,
): SettingsSectionId | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "houston:" || url.hostname !== "settings") return null;
    if (url.searchParams.has("org")) return null;
    const section = settingsSectionFromPath(`/settings${url.pathname}`);
    return section === "plan" ? section : null;
  } catch {
    return null;
  }
}

type SectionCapabilities =
  | { plan?: boolean; apiKeys?: boolean; heartbeat?: boolean }
  | null
  | undefined;

export interface SettingsSurface {
  touch: boolean;
}

export function settingsSectionAvailable(
  section: SettingsSectionId,
  capabilities: SectionCapabilities,
  surface: SettingsSurface = { touch: false },
): boolean {
  if (section === "plan") return capabilities?.plan === true;
  if (section === "apiKeys") return capabilities?.apiKeys === true;
  if (section === "morningBriefing") return capabilities?.heartbeat === true;
  if (section === "shortcuts") return !surface.touch;
  return true;
}

export function settingsLandingSection(
  section: SettingsSectionId,
  capabilities: SectionCapabilities,
): SettingsSectionId | null {
  return settingsSectionAvailable(section, capabilities) ? section : null;
}
