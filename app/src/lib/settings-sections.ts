/**
 * The settings sections that open on their own screen (a back control returns
 * to the index). A DOM-free module in `lib/` so both the UI store (`stores/ui`, which
 * types its deep-link pin against it) and the deep-link parser stay node-testable
 * without pulling in React/lucide — and so the store never has to depend on a
 * component module.
 *
 * Settings holds the standing setup a person adjusts rather than the places
 * work happens: their plan, their keys, their channels, their shortcuts, a bug
 * report, and their migration. Every section reads the current workspace, so
 * the whole screen sits behind one workspace gate.
 *
 * Skills are NOT here: an AI Employee's Skills section lives in that
 * employee's settings. Neither is the person: their Profile and About me are
 * the account menu's own screens (`components/account/`).
 */
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

/**
 * Validate an untrusted deep-link value (from the UI store) against the known
 * section ids. An unknown string or `null` yields `null` so a stale/garbage pin
 * can never land the user on a non-existent screen. Pure so it's unit-testable.
 */
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

/**
 * The ONE settings section an OS deep link may open: Billing, the Stripe
 * portal's return (`houston://settings/plan`). Any other section is refused so
 * an arbitrary link cannot steer the app.
 */
export function settingsSectionFromDeepLink(
  value: string,
): SettingsSectionId | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "houston:" || url.hostname !== "settings") return null;
    // An org checkout's return opens that org's Billing in Admin instead
    // (`checkout-return.ts`).
    if (url.searchParams.has("org")) return null;
    const section = settingsSectionFromPath(`/settings${url.pathname}`);
    return section === "plan" ? section : null;
  } catch {
    return null;
  }
}

/** The capability flags that decide whether a section exists here. */
type SectionCapabilities =
  | { plan?: boolean; apiKeys?: boolean; heartbeat?: boolean }
  | null
  | undefined;

/** Where Settings renders: `touch` is a phone-width layout or a store app. */
export interface SettingsSurface {
  touch: boolean;
}

/**
 * Billing exists only where the deployment serves the personal plan (C19);
 * API keys only where it serves the public API (C9: the hosted gateway, which
 * desktop and web both reach once signed in); the morning briefing only where
 * the deployment runs it (`heartbeat`). Keyboard shortcuts need a
 * keyboard, so a touch surface (phone width, or the iOS/Android app at any
 * width) has none.
 */
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

/**
 * Where a link to `section` lands: a section this deployment does not serve
 * (Billing without the plan capability, API keys without the public API) lands
 * on the Settings index instead of a blank screen.
 */
export function settingsLandingSection(
  section: SettingsSectionId,
  capabilities: SectionCapabilities,
): SettingsSectionId | null {
  return settingsSectionAvailable(section, capabilities) ? section : null;
}
