import { agentFileEventType } from "@houston/domain";
import type { WorkspaceContext } from "@houston/wire-types";
import {
  readAgentFile as readAgentFileStore,
  writeAgentFile as writeAgentFileStore,
} from "../agent-files";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { configWriteToSettings } from "../synthetic";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** The two workspace-root context files backing Settings on local/self-host
 *  (HOU-711). In cloud the same two blobs live in Supabase, not on the volume. */
const WORKSPACE_MD = "WORKSPACE.md";
const USER_MD = "USER.md";

/** The request path each delegated call issues, as the SDK builds it — what
 *  `viaSdk` needs to key the stuck-wake tracker and stamp an agent id on a
 *  failure (`client/sdk-error.ts`). */
const agentFilePath = (agentId: string, relPath: string) =>
  `/agents/${encodeURIComponent(agentId)}/agentfile/${relPath.split("/").map(encodeURIComponent).join("/")}`;
const contextPath = (kind: "workspace" | "user") => `/v1/${kind}-context`;

export function AgentFilesMixin<TBase extends BaseCtor>(Base: TBase) {
  class AgentFiles extends Base {
    // ---- agent data files (.houston/**) ----
    // Cloud: the host serves raw .houston docs off the agent's workspace vfs (this
    // is what the desktop UI's board/config/learnings actually read). Standalone
    // web: localStorage.
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
      // The runtime resolves the model from its OWN settings (activeProvider +
      // models[provider]), NOT from this .houston/config doc — which is the only
      // thing the model picker writes. Without mirroring, picking a different model
      // (e.g. a non-default OpenCode Go model) updates the doc but every turn keeps
      // running the provider's default. Bridge the config write into the engine.
      await this.syncConfigToSettings(agentPath, relPath, content);
      // Write-through echo: files-first writes (learnings, context, config doc, …)
      // have no dedicated event, so classify the path exactly as the host watcher
      // does and invalidate the matching cache locally. Null (e.g. `.git/**`) skips.
      const echoType = agentFileEventType(relPath);
      if (echoType) emitLocalEcho(echoType, { agentPath });
    }

    /**
     * Mirror a per-agent `config.json` write (provider + model) into the engine's
     * settings, so a model/provider pick in the chat picker actually changes what
     * the next turn runs. Best-effort: the doc write already succeeded, and the
     * picker only offers connected providers, so a failure here is logged (never a
     * silent model swap) but doesn't fail the file write.
     */
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
        console.error(
          "[engine-adapter] failed to sync the model selection to the engine:",
          err,
        );
      }
    }
    /**
     * Workspace + user context (HOU-711). Cloud: the two Supabase-backed blobs the
     * gateway splices into every turn — org-wide `workspace` + the caller's `user`,
     * never on the agent volume. Local/self-host: the two files on the agent, read
     * through the same agent-file path the CLAUDE.md instructions use.
     */
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
    /** Write ONE context slot: cloud → its gateway resource, local → its file. */
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
