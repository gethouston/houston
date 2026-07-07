import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  type AuthStorage,
  type CreateAgentSessionOptions,
  createAgentSession,
  type ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { makeAgentLoader } from "../../session/resource-loader";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import { PiSession } from "./session";

/**
 * Everything the pi backend needs. The SAME factory serves both call sites: the
 * long-lived server (module-level auth/registry/tools, one workspace) and the
 * per-request cloud runtime (throwaway dirs, per-turn auth/registry/tools). Only
 * the wiring differs — the caller builds the tools and passes them through here.
 */
export interface PiBackendDeps {
  workspaceDir: string;
  dataDir: string;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  /** Active built-in tool names (pi's tool allowlist). */
  tools: NonNullable<CreateAgentSessionOptions["tools"]>;
  /** SDK custom tools (clamped fs, run-code, integrations). */
  customTools: NonNullable<CreateAgentSessionOptions["customTools"]>;
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
      const loader = makeAgentLoader(deps.workspaceDir, opts.context);
      await loader.reload();
      const { session } = await createAgentSession({
        cwd: deps.workspaceDir,
        agentDir: deps.dataDir,
        model: opts.model as unknown as Model<Api>,
        ...(opts.thinkingLevel ? { thinkingLevel: opts.thinkingLevel } : {}),
        authStorage: deps.authStorage,
        modelRegistry: deps.modelRegistry,
        sessionManager: SessionManager.continueRecent(
          deps.workspaceDir,
          join(deps.dataDir, "sessions", opts.conversationId),
        ),
        resourceLoader: loader,
        tools: deps.tools,
        customTools: deps.customTools,
      });
      return new PiSession(session);
    },
  };
}
