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

export interface WorkspacesModule {
  listWorkspaces(): Promise<Workspace[]>;
  readAgentFile(agentId: string, relPath: string): Promise<string>;
  writeAgentFile(
    agentId: string,
    relPath: string,
    content: string,
  ): Promise<void>;
  getContext(kind: "workspace" | "user"): Promise<string>;
  setContext(kind: "workspace" | "user", content: string): Promise<void>;
  getSidebarLayout(workspaceId: string): Promise<SidebarLayout>;
  setSidebarLayout(
    workspaceId: string,
    layout: SidebarLayout,
  ): Promise<SidebarLayout>;
}

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
