import { agentFileEventType } from "@houston/domain";
import type { WorkspaceContext } from "@houston/wire-types";
import {
  readAgentFile as readAgentFileStore,
  writeAgentFile as writeAgentFileStore,
} from "../agent-files";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { reportAdapterError } from "../error-sink";
import { configWriteToSettings } from "../synthetic";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

const WORKSPACE_MD = "WORKSPACE.md";
const USER_MD = "USER.md";

const agentFilePath = (agentId: string, relPath: string) =>
  `/agents/${encodeURIComponent(agentId)}/agentfile/${relPath.split("/").map(encodeURIComponent).join("/")}`;
const contextPath = (kind: "workspace" | "user") => `/v1/${kind}-context`;

export function AgentFilesMixin<TBase extends BaseCtor>(Base: TBase) {
  class AgentFiles extends Base {
    async readAgentFile(agentPath: string, relPath: string): Promise<string> {
      if (this.ctx.cp)
        return viaSdk(agentFilePath(agentPath, relPath), () =>
          this.ctx.sdk.workspaces.readAgentFile(agentPath, relPath),
        );
      return readAgentFileStore(agentPath, relPath);
    }
    async writeAgentFile(
      agentPath: string,
      relPath: string,
      content: string,
    ): Promise<void> {
      if (this.ctx.cp) {
        await viaSdk(agentFilePath(agentPath, relPath), () =>
          this.ctx.sdk.workspaces.writeAgentFile(agentPath, relPath, content),
        );
      } else {
        writeAgentFileStore(agentPath, relPath, content);
      }
      await this.syncConfigToSettings(agentPath, relPath, content);
      const echoType = agentFileEventType(relPath);
      if (echoType) emitLocalEcho(echoType, { agentPath });
    }

    private async syncConfigToSettings(
      agentPath: string,
      relPath: string,
      content: string,
    ): Promise<void> {
      const update = configWriteToSettings(relPath, content);
      if (!update) return;
      try {
        const engine = this.ctx.cp
          ? controlPlane.runtimeClientFor(this.ctx.cp, agentPath)
          : this.ctx.engine;
        await engine.setSettings(update);
      } catch (err) {
        reportAdapterError("engine-adapter.config-settings-sync", err);
      }
    }
    async getWorkspaceContext(agentPath: string): Promise<WorkspaceContext> {
      if (this.ctx.cp) {
        const [workspace, user] = await Promise.all([
          viaSdk(contextPath("workspace"), () =>
            this.ctx.sdk.workspaces.getContext("workspace"),
          ),
          viaSdk(contextPath("user"), () =>
            this.ctx.sdk.workspaces.getContext("user"),
          ),
        ]);
        return { workspace, user };
      }
      const [workspace, user] = await Promise.all([
        this.readAgentFile(agentPath, WORKSPACE_MD),
        this.readAgentFile(agentPath, USER_MD),
      ]);
      return { workspace, user };
    }
    async setWorkspaceContextSlot(
      agentPath: string,
      slot: "workspace" | "user",
      content: string,
    ): Promise<void> {
      if (this.ctx.cp) {
        await viaSdk(contextPath(slot), () =>
          this.ctx.sdk.workspaces.setContext(slot, content),
        );
        return;
      }
      await this.writeAgentFile(
        agentPath,
        slot === "workspace" ? WORKSPACE_MD : USER_MD,
        content,
      );
    }
  }
  return AgentFiles;
}
