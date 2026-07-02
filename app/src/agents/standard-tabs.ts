/**
 * Standard tab set every agent shows.
 *
 * Agents used to declare their own tabs in houston.json, but that flexibility
 * was never used in practice (zero agents shipped a custom React tab) and
 * caused drift between installed agents and freshly-installed ones. There's
 * now one canonical set, hardcoded here.
 */

import { controlPlaneBuild } from "../lib/engine-mode";

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

// Integrations (Composio, platform mode) are a v3-host feature; the legacy Rust engine
// has no /v1/integrations routes. Gate on the build flag — a deterministic build
// constant (NOT the runtime handshake), so the tab is present in every host build
// and absent in the legacy one, uniformly across every STANDARD_TABS consumer.
const HOST_BUILD = controlPlaneBuild(
  import.meta.env as { VITE_NEW_ENGINE_URL?: string; VITE_NEW_ENGINE?: string },
);

export const STANDARD_TABS: AgentTab[] = [
  { id: "activity", label: "Activity", builtIn: "board", badge: "activity" },
  { id: "routines", label: "Routines", builtIn: "routines" },
  ...(HOST_BUILD
    ? [{ id: "integrations", label: "Integrations", builtIn: "integrations" }]
    : []),
  { id: "files", label: "Files", builtIn: "files" },
  {
    id: "job-description",
    label: "Agent Settings",
    builtIn: "job-description",
  },
  { id: "archived", label: "Archived", builtIn: "archived" },
];

export const DEFAULT_TAB_ID = "activity";

export const STANDARD_TAB_IDS: ReadonlySet<string> = new Set(
  STANDARD_TABS.map((tab) => tab.id),
);
