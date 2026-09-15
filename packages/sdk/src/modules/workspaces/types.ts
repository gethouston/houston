/**
 * The workspaces family's wire shapes and write vocabulary.
 *
 * `Workspace` comes from `@houston/runtime-client` (the one wire contract the
 * engine and every client already share). The sidebar layout has no home
 * there — it is a client arrangement the host stores as a preference blob —
 * so its shape is declared here, structurally identical to the one the app
 * renders, which is what lets a surface hand its own layout straight in.
 */

import type { Workspace as WorkspaceCore } from "@houston/runtime-client";
import { requireString } from "../payload";

/**
 * Which kind of space a workspace row bridges (C8 §Workspaces bridge). Present
 * on hosts that serve spaces; ABSENT on single-player/self-host hosts (read as
 * `"personal"`), so every pre-C8 profile stays valid.
 */
export type WorkspaceKind = "personal" | "org";

/**
 * One row of the workspace list. The conversation core's `Workspace` carries
 * the identity and the locale override; the list route adds the space `kind`,
 * which is what tells a team row (`org:<slug>`) from the personal one.
 */
export interface Workspace extends WorkspaceCore {
  kind?: WorkspaceKind;
}

/** A user-created, collapsible sidebar section that agents are dragged into. */
export interface SidebarGroup {
  /** Stable client-minted id (never an agent id). */
  id: string;
  name: string;
  collapsed: boolean;
  /** Member agent ids, in drag order. */
  agentIds: string[];
  /** Shared context injected into every member agent's system prompt, mirrored
   *  by the host to each member's `GROUP.md` on the layout write. */
  context?: string;
  /** The team's glyph NAME (never an image). Absent = render your own default. */
  icon?: string;
  /** The team's color: `#rrggbb` or a theme token name. Absent = unset. */
  color?: string;
}

/**
 * Per-workspace sidebar arrangement: the user's named groups plus the manual
 * (drag) order of everything. Persisted by the host as the `sidebar_layout`
 * workspace preference; absent/corrupt reads as
 * `{ groups: [], ungroupedOrder: [] }`.
 */
export interface SidebarLayout {
  /** Named groups, in display order. */
  groups: SidebarGroup[];
  /** Drag order of agents not in any group. */
  ungroupedOrder: string[];
  /** Whether the DEFAULT team block is folded shut. Absent = expanded. */
  defaultCollapsed?: boolean;
  /** The DEFAULT team's shared context — the counterpart of
   *  {@link SidebarGroup.context} for the one team that owns no group row. */
  defaultContext?: string;
}

/** The write vocabulary — the same constants back the facade and the bridge. */
export const WorkspacesCommand = {
  List: "workspaces/list",
  ReadAgentFile: "workspaces/readAgentFile",
  WriteAgentFile: "workspaces/writeAgentFile",
  GetContext: "workspaces/getContext",
  SetContext: "workspaces/setContext",
  GetSidebarLayout: "workspaces/getSidebarLayout",
  SetSidebarLayout: "workspaces/setSidebarLayout",
} as const;

export type WorkspacesCommandType =
  (typeof WorkspacesCommand)[keyof typeof WorkspacesCommand];

/** The context slot off an untrusted payload — the union, never a free string:
 *  the value becomes part of the address this call acts on. */
export function requireContextKind(payload: unknown): "workspace" | "user" {
  const kind = requireString(payload, "kind");
  if (kind !== "workspace" && kind !== "user")
    throw new Error("'kind' must be 'workspace' or 'user'");
  return kind;
}

/** A layout off an untrusted payload, shape-checked down to the two arrays the
 *  host's strict validator requires — a bad body would otherwise read as a 400
 *  the caller cannot act on. */
export function requireSidebarLayout(payload: unknown): SidebarLayout {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>).layout
      : undefined;
  if (typeof value !== "object" || value === null)
    throw new Error("missing 'layout'");
  const layout = value as Partial<SidebarLayout>;
  if (!Array.isArray(layout.groups) || !Array.isArray(layout.ungroupedOrder))
    throw new Error("'layout' needs 'groups' and 'ungroupedOrder' arrays");
  return layout as SidebarLayout;
}
