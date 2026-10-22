import { join } from "node:path";
import type { Api, Model, Transport } from "@earendil-works/pi-ai";
import {
  type CreateAgentSessionOptions,
  createAgentSession,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import {
  type HedgeObserver,
  hedgedModelRuntime,
} from "../../ai/hedged-runtime";
import { isManagedBridgeModel } from "../../ai/openai-compatible-model";
import { makeAgentLoader } from "../../session/resource-loader";
import { toolNamesForMode } from "../../session/tool-selection";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import { SentRequests } from "./model-phase";
import { PiSession } from "./session";
import { resumeSessionManager } from "./session-files";
import { piTransportSettings } from "./transport-settings";

/**
 * Everything the pi backend needs. The SAME factory serves both call sites: the
 * long-lived server (module-level auth/registry/tools, one workspace) and the
 * per-request cloud runtime (throwaway dirs, per-turn auth/registry/tools). Only
 * the wiring differs — the caller builds the tools and passes them through here.
 */
export interface PiBackendDeps {
  workspaceDir: string;
  dataDir: string;
  modelRuntime: ModelRuntime;
  /** Active built-in tool names (pi's tool allowlist). */
  tools: NonNullable<CreateAgentSessionOptions["tools"]>;
  /** SDK custom tools (clamped fs, run-code, integrations). */
  customTools: NonNullable<CreateAgentSessionOptions["customTools"]>;
  /**
   * Base prompt for this session. Absent = the process's own
   * (`resource-loader.ts`). A pooled turn supplies its own so BOTH backends
   * describe the same capabilities — the Claude branch already takes one.
   */
  systemPrompt?: string;
  /**
   * The provider transport pi uses (`turn/turn-pi-transport.ts`). Absent =
   * pi's own setting, `auto`: the long-lived server reuses pi's cached Codex
   * WebSocket across a conversation's turns.
   */
  transport?: Transport;
  /** Workspace-shared skills dir; absent = the process's (resource-loader.ts). */
  sharedSkillsDir?: string;
  /** The coordinator role for this backend's sessions. Absent = the
   *  process's own; a pooled turn passes the turn's (`null` included). */
  role?: AssistantRuntimeRole | null;
  /** Told when a request's response opens and when one is sent again. */
  hedge?: HedgeObserver;
}

/**
 * Build the pi HarnessBackend. `createSession` rehydrates this conversation's pi
 * session if one is on disk, else starts fresh: `continueRecent()` reopens the
 * most recent session in the conversation's dedicated dir, and
 * `createAgentSession` rehydrates the agent's message history from it (SDK:
 * hasExistingSession → agent.state.messages). `create()` would mint a brand-new
 * empty session every time, so a fresh process (runtime restart, or a cloud
 * sandbox woken from sleep) would silently lose all prior turns.
 */
export function createPiBackend(deps: PiBackendDeps): HarnessBackend {
  return {
    id: "pi",
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      // The turn's mode overlays its prompt (via the loader) and clamps the
      // allowlist through `toolNamesForMode`: plan → the read-only subset, auto →
      // everything minus ask_user (the one blocking tool),
      // execute → unchanged. The customTools list is UNCHANGED — pi gates its
      // custom tools by the `tools` name allowlist, so filtering the names here
      // drops the excluded tools from the model's reach without rebuilding the
      // tool objects. Workspace + user context (opts.context) rides alongside.
      const loader = makeAgentLoader(
        deps.workspaceDir,
        opts.mode,
        opts.context,
        deps.systemPrompt,
        deps.sharedSkillsDir,
        deps.role,
      );
      await loader.reload();
      const requests = new SentRequests();
      const { session } = await createAgentSession({
        cwd: deps.workspaceDir,
        agentDir: deps.dataDir,
        model: opts.model as unknown as Model<Api>,
        ...(opts.thinkingLevel ? { thinkingLevel: opts.thinkingLevel } : {}),
        // Every session request is hedged against a provider that never
        // answers (ai/hedged-runtime.ts).
        modelRuntime: hedgedModelRuntime(
          deps.modelRuntime,
          requests.observe(deps.hedge),
        ),
        // A cross-backend rebuild (opts.fresh) mints a NEW session file in the
        // conversation's dir instead of reopening the most recent one: the
        // history arrives as a transcript replay on the first prompt (HOU-951),
        // and a conversation returning to pi after a Claude era must not resume
        // its stale pre-switch session on top of that replay.
        sessionManager: resumeSessionManager(
          deps.workspaceDir,
          join(deps.dataDir, "sessions", opts.conversationId),
          opts.fresh === true,
        ),
        resourceLoader: loader,
        ...piTransportSettings(deps.workspaceDir, deps.dataDir, deps.transport),
        tools: toolNamesForMode(opts.mode, deps.tools),
        customTools: deps.customTools,
      });
      if (isManagedBridgeModel(opts.model)) session.setAutoRetryEnabled(false);
      return new PiSession(session, requests);
    },
  };
}
