import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import { requireString } from "../payload";
import {
  getContext,
  getHostSidebarLayout,
  listWorkspaces,
  putHostSidebarLayout,
  readAgentFile,
  setContext,
  writeAgentFile,
} from "./http";
import {
  requireContextKind,
  requireSidebarLayout,
  type SidebarLayout,
  type Workspace,
  WorkspacesCommand,
} from "./types";

export type {
  SidebarGroup,
  SidebarLayout,
  SidebarRootEntry,
  Workspace,
  WorkspaceKind,
  WorkspacesCommandType,
} from "./types";
export { WorkspacesCommand } from "./types";

/** The typed facade for the workspace family. Every call throws on a non-2xx. */
export interface WorkspacesModule {
  /** The workspaces this account can open, as the host lists them. */
  listWorkspaces(): Promise<Workspace[]>;
  /** Read one of an agent's `.houston/**` documents. */
  readAgentFile(agentId: string, relPath: string): Promise<string>;
  /** Replace one of an agent's `.houston/**` documents. */
  writeAgentFile(
    agentId: string,
    relPath: string,
    content: string,
  ): Promise<void>;
  /** Read one background-notes slot: org-wide, or the caller's own. */
  getContext(kind: "workspace" | "user"): Promise<string>;
  /** Replace one background-notes slot. */
  setContext(kind: "workspace" | "user", content: string): Promise<void>;
  /** Read a workspace's stored sidebar arrangement. */
  getSidebarLayout(workspaceId: string): Promise<SidebarLayout>;
  /** Persist a sidebar arrangement; answers the host's stored copy. */
  setSidebarLayout(
    workspaceId: string,
    layout: SidebarLayout,
  ): Promise<SidebarLayout>;
}

/** A failed workspaces request. `status` is the upstream HTTP status. */
export class WorkspacesHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "WorkspacesHttpError");
  }
}

export function createWorkspacesModule(ctx: ModuleContext): WorkspacesModule {
  const scope = moduleScope(ctx, "workspaces", WorkspacesHttpError);

  const facade: WorkspacesModule = {
    listWorkspaces: () => listWorkspaces(scope),
    readAgentFile: (agentId, relPath) => readAgentFile(scope, agentId, relPath),
    writeAgentFile: (agentId, relPath, content) =>
      writeAgentFile(scope, agentId, relPath, content),
    getContext: (kind) => getContext(scope, kind),
    setContext: (kind, content) => setContext(scope, kind, content),
    getSidebarLayout: (workspaceId) => getHostSidebarLayout(scope, workspaceId),
    setSidebarLayout: (workspaceId, layout) =>
      putHostSidebarLayout(scope, workspaceId, layout),
  };

  ctx.registerCommand(WorkspacesCommand.List, () => facade.listWorkspaces());
  ctx.registerCommand(WorkspacesCommand.ReadAgentFile, (p) =>
    facade.readAgentFile(
      requireString(p, "agentId"),
      requireString(p, "relPath"),
    ),
  );
  ctx.registerCommand(WorkspacesCommand.WriteAgentFile, (p) =>
    facade.writeAgentFile(
      requireString(p, "agentId"),
      requireString(p, "relPath"),
      requireString(p, "content"),
    ),
  );
  ctx.registerCommand(WorkspacesCommand.GetContext, (p) =>
    facade.getContext(requireContextKind(p)),
  );
  ctx.registerCommand(WorkspacesCommand.SetContext, (p) =>
    facade.setContext(requireContextKind(p), requireString(p, "content")),
  );
  ctx.registerCommand(WorkspacesCommand.GetSidebarLayout, (p) =>
    facade.getSidebarLayout(requireString(p, "workspaceId")),
  );
  ctx.registerCommand(WorkspacesCommand.SetSidebarLayout, (p) =>
    facade.setSidebarLayout(
      requireString(p, "workspaceId"),
      requireSidebarLayout(p),
    ),
  );

  return facade;
}
