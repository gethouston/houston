/**
 * The settings sections that open on their own screen (a back bar returns to the
 * index). A DOM-free module in `lib/` so both the UI store (`stores/ui`, which
 * types its deep-link pin against it) and the deep-link parser stay node-testable
 * without pulling in React/lucide — and so the store never has to depend on a
 * component module.
 *
 * Settings holds the standing setup a person adjusts rather than the places
 * work happens: their profile, what their agents know about them, their keys,
 * their shortcuts, a bug report, their migration, plus Workspace management,
 * which administers the SPACE. Every section reads the current workspace, so
 * the whole screen sits behind the ONE workspace gate and no section opts out
 * of it. The gates that hide a section hide its INDEX ROW
 * (`hooks/use-surface-gates.ts`); the gateway is what enforces the claim.
 *
 * The shared Skills library is NOT here: it is a screen of its own, opened
 * from the rail's Skills row. An AI Employee's own Skills section is that same
 * surface scoped to that employee, and it lives in the agent's settings, not
 * in this list.
 */
export const SETTINGS_SECTION_IDS = [
  "profile",
  "plan",
  "aboutMe",
  "workspace",
  "apiKeys",
  "channels",
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
    const section = settingsSectionFromPath(`/settings${url.pathname}`);
    return section === "plan" ? section : null;
  } catch {
    return null;
  }
}

/** Billing exists only where the deployment serves the personal plan (C19). */
export function settingsSectionAvailable(
  section: SettingsSectionId,
  capabilities: { plan?: boolean } | null | undefined,
): boolean {
  return section !== "plan" || capabilities?.plan === true;
}

/**
 * Where a link to `section` lands: a section this deployment does not serve
 * (Billing without the plan capability) lands on the Settings index instead of
 * a blank screen.
 */
export function settingsLandingSection(
  section: SettingsSectionId,
  capabilities: { plan?: boolean } | null | undefined,
): SettingsSectionId | null {
  return settingsSectionAvailable(section, capabilities) ? section : null;
}
