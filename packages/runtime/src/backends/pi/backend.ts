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
import { config } from "../../config";
import {
  withNextStepSuggestions,
  withNextStepSuggestionTools,
} from "../../session/next-step-suggestions";
import { makeAgentLoader, SYSTEM_PROMPT } from "../../session/resource-loader";
import { withRoutineTimezone } from "../../session/routine-timezone";
import { toolNamesForMode } from "../../session/tool-selection";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import { SentRequests } from "./model-phase";
import { PiSession } from "./session";
import { resumeSessionManager } from "./session-files";
import { piThinkingLevel } from "./thinking-level";
import { makeToolResultContext } from "./tool-result-context";
import { piTransportSettings } from "./transport-settings";

export interface PiBackendDeps {
  workspaceDir: string;
  dataDir: string;
  modelRuntime: ModelRuntime;
  tools: NonNullable<CreateAgentSessionOptions["tools"]>;
  customTools: NonNullable<CreateAgentSessionOptions["customTools"]>;
  systemPrompt?: string;
  transport?: Transport;
  sharedSkillsDir?: string;
  role?: AssistantRuntimeRole | null;
  hedge?: HedgeObserver;
}

export function createPiBackend(deps: PiBackendDeps): HarnessBackend {
  return {
    id: "pi",
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      const loader = makeAgentLoader(
        deps.workspaceDir,
        opts.mode,
        opts.context,
        withNextStepSuggestions(
          withRoutineTimezone(
            deps.systemPrompt || config.systemPrompt || SYSTEM_PROMPT,
            opts.timezone,
            deps.role,
          ),
          opts.nextStepSuggestions,
        ),
        deps.sharedSkillsDir,
        deps.role,
      );
      await loader.reload();
      const requests = new SentRequests();
      const { session } = await createAgentSession({
        cwd: deps.workspaceDir,
        agentDir: deps.dataDir,
        model: opts.model as unknown as Model<Api>,
        ...(opts.thinkingLevel
          ? { thinkingLevel: piThinkingLevel(opts.model, opts.thinkingLevel) }
          : {}),
        modelRuntime: hedgedModelRuntime(
          deps.modelRuntime,
          requests.observe(deps.hedge),
        ),
        sessionManager: resumeSessionManager(
          deps.workspaceDir,
          join(deps.dataDir, "sessions", opts.conversationId),
          opts.fresh === true,
        ),
        resourceLoader: loader,
        ...piTransportSettings(deps.workspaceDir, deps.dataDir, deps.transport),
        tools: toolNamesForMode(opts.mode, deps.tools).filter(
          (name) =>
            opts.nextStepSuggestions !== false || name !== "suggest_actions",
        ),
        customTools: withNextStepSuggestionTools(
          deps.customTools,
          opts.nextStepSuggestions,
        ),
      });
      if (isManagedBridgeModel(opts.model)) session.setAutoRetryEnabled(false);
      const projected = session.agent.transformContext;
      const toolResults = makeToolResultContext({
        workspaceDir: deps.workspaceDir,
        conversationId: opts.conversationId,
      });
      session.agent.transformContext = async (messages, signal) =>
        toolResults(projected ? await projected(messages, signal) : messages);
      return new PiSession(session, requests);
    },
  };
}
