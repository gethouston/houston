import { parseSidebarLayout, type SidebarLayout } from "@houston/protocol";
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

export type {
  SidebarGroup,
  SidebarLayout,
  SidebarRootEntry,
} from "@houston/protocol";

/** The write vocabulary — the same constants back the facade and `dispatch`. */
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

export function requireContextKind(payload: unknown): "workspace" | "user" {
  const kind = requireString(payload, "kind");
  if (kind !== "workspace" && kind !== "user")
    throw new Error("'kind' must be 'workspace' or 'user'");
  return kind;
}

export function requireSidebarLayout(payload: unknown): SidebarLayout {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>).layout
      : undefined;
  if (typeof value !== "object" || value === null)
    throw new Error("missing 'layout'");
  const layout = parseSidebarLayout(value);
  if (!layout) throw new Error("'layout' is not a valid sidebar layout");
  return layout;
}
