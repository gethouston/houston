/**
 * The settings sections that open on their own screen (a back bar returns to the
 * index). A DOM-free module in `lib/` so both the UI store (`stores/ui`, which
 * types its deep-link pin against it) and the deep-link parser stay node-testable
 * without pulling in React/lucide — and so the store never has to depend on a
 * component module.
 */
export const SETTINGS_SECTION_IDS = [
  "profile",
  "apiKeys",
  "workspaceContext",
  "userContext",
  "shortcuts",
  "reportBug",
  "migration",
  // The three surfaces that used to be their own sidebar entries (HOU-788).
  // They keep their whole behaviour; only where they mount changed.
  "usage",
  "permissions",
  "organization",
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

/** The Teams gates a settings section can ride on (see `useSurfaceGates`). */
export interface SettingsGates {
  /** Admin + Permissions: multiplayer owner/admin, team space on Spaces. */
  showOrganization: boolean;
  /** Usage: shares the AI Models hub gate (same org-level provider accounts). */
  showAiModels: boolean;
}

/**
 * Which gate each gated section rides on. A section absent from this map is
 * ungated: every caller reaches it, so it never blocks and never waits on
 * capabilities. Declared once so `blockedSettingsSection` and
 * `settingsSectionGate` can never disagree about who is gated.
 */
const SECTION_GATE: Partial<Record<SettingsSectionId, keyof SettingsGates>> = {
  usage: "showAiModels",
  permissions: "showOrganization",
  organization: "showOrganization",
};

/**
 * The sections that moved in from the sidebar (HOU-788). They read the org /
 * billing / usage endpoints, never the workspace list, so they must not inherit
 * the Settings workspace gate — see `settingsSectionNeedsWorkspace`.
 */
const MOVED_SECTION_IDS: readonly SettingsSectionId[] = [
  "usage",
  "permissions",
  "organization",
];

/**
 * Whether a settings section points at a surface whose Teams gate is off for
 * this caller. The index row is already hidden, so this only catches a section
 * the user reached another way: a deep-link pin, or a role/space change while
 * the section was already open (switching out of a team space hides Admin +
 * Permissions). `SettingsView` falls such a section back to the index, mirroring
 * the shell's stale top-level view reset. Pure so the fallback rule is
 * unit-tested.
 *
 * Only meaningful once the gates are RESOLVED: capabilities are `null` while
 * they load, which reads as "blocked" here. Callers must go through
 * {@link settingsSectionGate} so a loading window never drops a live section.
 */
export function blockedSettingsSection(
  section: SettingsSectionId,
  gates: SettingsGates,
): boolean {
  const gate = SECTION_GATE[section];
  return gate !== undefined && !gates[gate];
}

/**
 * What a settings section should do RIGHT NOW, given the gates and whether they
 * have resolved yet:
 *
 * - `loading` — a gated section whose capabilities are still in flight. The
 *   view must hold the section and show a loading frame; deciding here would
 *   read the null-capabilities gates as `false` and dump an owner back to the
 *   index (a team-space switch drops the capabilities query, so this window is
 *   deterministic, not theoretical).
 * - `blocked` — resolved, and this caller genuinely cannot see the section.
 * - `visible` — render it. Ungated sections are always visible; they wait on
 *   nothing.
 */
export type SettingsSectionGate = "loading" | "blocked" | "visible";

export function settingsSectionGate(
  section: SettingsSectionId,
  gates: SettingsGates & {
    /** False while the capabilities behind the gates are still loading. */
    ready: boolean;
  },
): SettingsSectionGate {
  if (SECTION_GATE[section] === undefined) return "visible";
  if (!gates.ready) return "loading";
  return blockedSettingsSection(section, gates) ? "blocked" : "visible";
}

/**
 * Whether a settings section needs a loaded workspace to render. The Settings
 * index and every ORIGINAL section read the current workspace, so they sit
 * behind the workspace gate. The three moved surfaces (HOU-788) do not: they
 * read org / billing / usage, never `GET /v1/workspaces`, and as top-level views
 * they rendered with no workspace gate at all. Moving them into Settings must
 * not silently hand them a precondition they never had — least of all on the
 * billing recovery path, where a deep link into Admin exists precisely because
 * something is already failing.
 */
export function settingsSectionNeedsWorkspace(
  section: SettingsSectionId,
): boolean {
  return !MOVED_SECTION_IDS.includes(section);
}
