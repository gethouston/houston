import { parseSidebarLayout, type SidebarLayout } from "@houston/protocol";
import type { Workspace as WorkspaceCore } from "@houston/runtime-client";
import { requireString } from "../payload";

export type WorkspaceKind = "personal" | "org";

export interface Workspace extends WorkspaceCore {
  kind?: WorkspaceKind;
}

export type {
  SidebarGroup,
  SidebarLayout,
  SidebarRootEntry,
} from "@houston/protocol";

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
