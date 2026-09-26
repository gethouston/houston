/**
 * The workspaces family's wire shapes and write vocabulary.
 *
 * `Workspace` comes from `@houston/runtime-client` (the one wire contract the
 * engine and every client already share). The sidebar layout and its strict
 * parser come from `@houston/protocol`, the one definition the host, the
 * adapter and the app share.
 */

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

/** The context slot off an untrusted payload — the union, never a free string:
 *  the value becomes part of the address this call acts on. */
export function requireContextKind(payload: unknown): "workspace" | "user" {
  const kind = requireString(payload, "kind");
  if (kind !== "workspace" && kind !== "user")
    throw new Error("'kind' must be 'workspace' or 'user'");
  return kind;
}

/** A layout off an untrusted payload, held to the host's own strict parser
 *  so a bad body fails here rather than as a 400 the caller cannot act on. */
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
