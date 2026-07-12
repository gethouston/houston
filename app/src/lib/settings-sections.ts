/**
 * The settings sections that open on their own screen (a back bar returns to the
 * index). A DOM-free module in `lib/` so both the UI store (`stores/ui`, which
 * types its deep-link pin against it) and the deep-link parser stay node-testable
 * without pulling in React/lucide — and so the store never has to depend on a
 * component module.
 */
export const SETTINGS_SECTION_IDS = [
  "members",
  "connectedAccounts",
  "apiKeys",
  "workspaceContext",
  "userContext",
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
