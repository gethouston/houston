import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { withNextStepSuggestions } from "../../session/next-step-suggestions";
import { withRoutineTimezone } from "../../session/routine-timezone";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import type { ClaudeBackendDeps } from "./backend-types";
import { resolveClaudeExecutable } from "./binary-path";
import { buildHoustonMcpServer, HOUSTON_MCP_SERVER_NAME } from "./custom-tools";
import { toSdkModel } from "./model";
import { hasPreviousSuggestionCalls } from "./next-step-suggestions";
import { CLAUDE_QUERY_DEFAULTS } from "./query-defaults";
import { makeRefreshAuth } from "./refresh-auth";
import { assertAnthropicScopeCredential } from "./scope-guard";
import {
  ClaudeBackendUnavailableError,
  loadedClaudeSdk,
  preloadClaudeSdk,
} from "./sdk-loader";
import { installClaudeSdkWarningFilter } from "./sdk-warnings";
import { type ClaudeQuery, ClaudeSession } from "./session";
import { createSessionsStore } from "./sessions-store";
import { buildSystemPrompt } from "./system-prompt";
import { buildSessionHooks } from "./tool-gate-hook";
import { buildToolPolicy, makeCanUseTool } from "./tool-policy";

export type { ClaudeBackendDeps, ClaudeToken } from "./backend-types";
export { ClaudeBackendUnavailableError } from "./sdk-loader";

export function createClaudeBackend(deps: ClaudeBackendDeps): HarnessBackend {
  installClaudeSdkWarningFilter();
  return {
    id: "anthropic",
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      const token = deps.readToken();
      assertAnthropicScopeCredential(token);

      let query: ClaudeQuery;
      let houstonMcp: ReturnType<typeof buildHoustonMcpServer>;
      try {
        const sdk =
          deps.sdk ??
          (await loadedClaudeSdk(deps.sdkLoad ?? preloadClaudeSdk()));
        query = sdk.query as ClaudeQuery;
        houstonMcp = buildHoustonMcpServer({
          createSdkMcpServer: sdk.createSdkMcpServer,
          integrations: deps.integrations,
          assistant: deps.assistant,
          personalAssistant: deps.personalAssistant,
          tools: deps.tools,
          browser: deps.browser,
          mode: opts.mode,
          nextStepSuggestions: opts.nextStepSuggestions,
          silentNextStepSuggestions:
            opts.nextStepSuggestions === false &&
            !opts.fresh &&
            hasPreviousSuggestionCalls(deps.layout, opts.conversationId),
          spill: {
            workspaceDir: deps.workspaceDir,
            conversationId: opts.conversationId,
          },
        });
      } catch (err) {
        throw new ClaudeBackendUnavailableError(err);
      }

      const localBash = deps.toolSelection.toolNames.includes("bash");
      const policy = buildToolPolicy({
        localBash,
        mode: opts.mode,
        personalAssistant: deps.personalAssistant,
      });
      const pathToClaudeCodeExecutable = resolveClaudeExecutable();
      const refreshAuth = makeRefreshAuth(deps);
      const initialAuth = refreshAuth();
      const baseOptions: Options = {
        cwd: deps.workspaceDir,
        env: initialAuth.env,
        ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
        ...CLAUDE_QUERY_DEFAULTS,
        tools: policy.tools,
        disallowedTools: policy.disallowedTools,
        mcpServers: { [HOUSTON_MCP_SERVER_NAME]: houstonMcp.server },
        allowedTools: houstonMcp.allowedTools,
        hooks: buildSessionHooks(deps),
        canUseTool: makeCanUseTool(deps.workspaceDir, deps.fileGuard),
        systemPrompt: buildSystemPrompt(
          deps.workspaceDir,
          withNextStepSuggestions(
            withRoutineTimezone(deps.systemPrompt, opts.timezone, deps.role),
            opts.nextStepSuggestions,
          ),
          opts.mode,
          opts.context,
          deps.role,
        ),
      };

      const sessionsStore = createSessionsStore({
        configDir: deps.layout.configDir,
        sessionsFile: deps.layout.sessionsFile,
        cwd: deps.workspaceDir,
      });
      if (opts.fresh) sessionsStore.remove(opts.conversationId);
      return new ClaudeSession({
        query,
        conversationId: opts.conversationId,
        baseOptions,
        sessionsStore,
        ...(deps.compactions ? { compactions: deps.compactions } : {}),
        model: toSdkModel(opts.model.id),
        thinkingLevel: opts.thinkingLevel,
        freshRetryPromptPrefix: opts.freshRetryPromptPrefix,
        recordedContextTokens: opts.recordedContextTokens,
        refreshAuth,
        usedAccessDigest: initialAuth.accessDigest,
      });
    },
  };
}

export { buildClaudeEnv } from "./claude-env";
