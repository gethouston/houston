/**
 * Standard tab set every agent shows.
 *
 * Agents used to declare their own tabs in houston.json, but that flexibility
 * was never used in practice (zero agents shipped a custom React tab) and
 * caused drift between installed agents and freshly-installed ones. There's
 * now one canonical set, hardcoded here.
 */

export interface AgentTab {
  /** Tab identifier (also matches the built-in component key in tab-resolver). */
  id: string;
  /** Display label fallback when no i18n key is available. */
  label: string;
  /** Built-in component key consumed by tab-resolver. */
  builtIn: string;
  /** Badge source: "activity" shows count of items needing attention. */
  badge?: "activity";
}

export const STANDARD_TABS: AgentTab[] = [
  { id: "activity", label: "Activity", builtIn: "board", badge: "activity" },
  { id: "routines", label: "Routines", builtIn: "routines" },
  { id: "files", label: "Files", builtIn: "files" },
  { id: "job-description", label: "Job Description", builtIn: "job-description" },
  { id: "archived", label: "Archived", builtIn: "archived" },
];

export const DEFAULT_TAB_ID = "activity";

export const STANDARD_TAB_IDS: ReadonlySet<string> = new Set(
  STANDARD_TABS.map((tab) => tab.id),
);
