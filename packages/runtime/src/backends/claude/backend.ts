import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { withNextStepSuggestions } from "../../session/next-step-suggestions";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import type { ClaudeBackendDeps } from "./backend-types";
import { resolveClaudeExecutable } from "./binary-path";
import { buildHoustonMcpServer, HOUSTON_MCP_SERVER_NAME } from "./custom-tools";
import { toSdkModel } from "./model";
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

/**
 * Build the Claude Agent SDK `HarnessBackend` for the `anthropic` provider.
 *
 * The SDK is an OPTIONAL dependency, so it is imported lazily inside
 * `createSession` — never at module load — and its absence throws a typed
 * `ClaudeBackendUnavailableError` rather than crashing the runtime. The session
 * runs the SDK subprocess against Houston's SHARED credential dir
 * (`CLAUDE_CONFIG_DIR` = `claudeLoginConfigDir()`, the same dir the desktop
 * `claude auth login` caches into, so the SDK reads that cached credential and
 * self-refreshes it) and no filesystem settings (`settingSources: []`), so
 * nothing else on the host machine leaks in. `options.env` REPLACES the
 * subprocess environment, so `buildClaudeEnv` builds it from an ALLOWLIST — the
 * few operational vars the SDK needs plus the config dir and the one connected
 * credential — never spreading `process.env` (see `./claude-env`).
 *
 * That shared dir is why a PERSONAL scope with no personal token is REFUSED
 * before the SDK is touched (`assertAnthropicScopeCredential`): on a managed pod
 * the dir holds the TEAM's credential, so a member's turn would authenticate as
 * the team and the SDK would self-refresh the team's refresh-token family in
 * place — a second rotator beside the gateway, and one member's account paying
 * for another's turn (see `./scope-guard`). Team scope (desktop,
 * self-host, every pre-HOU-976 request) and any scope that DOES carry a token are
 * unaffected. A personal scope that DOES carry a token additionally gets its own
 * credential-store dir (`anthropicCredentialStorageDir`), because that token is
 * access-only and can expire MID-TURN — at which point the CLI's own 401 recovery
 * would otherwise re-read that shared dir and finish the turn on the team account.
 */
export function createClaudeBackend(deps: ClaudeBackendDeps): HarnessBackend {
  // Houston pre-approves its own MCP tools, which the SDK warns about on every
  // single `query()`. Reported once, at INFO, instead of once per turn at ERROR.
  installClaudeSdkWarningFilter();
  return {
    // The pi provider id this backend serves turns for (the registry maps
    // `model.provider` → backend). Houston's native Anthropic provider is
    // `anthropic`, so it must register under exactly that.
    id: "anthropic",
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      // Read the credential ONCE and decide before anything else: a personal
      // scope with no personal token must never reach the SDK, whose config dir
      // is the pod-shared (team) one. Refusing here also keeps the failure a
      // typed reconnect card instead of a mid-turn surprise.
      const token = deps.readToken();
      assertAnthropicScopeCredential(token);

      let query: ClaudeQuery;
      let houstonMcp: ReturnType<typeof buildHoustonMcpServer>;
      try {
        const sdk =
          deps.sdk ??
          (await loadedClaudeSdk(deps.sdkLoad ?? preloadClaudeSdk()));
        query = sdk.query as ClaudeQuery;
        // Built here, not at module load, so the optional SDK's
        // `createSdkMcpServer` is only touched once the SDK is confirmed present.
        houstonMcp = buildHoustonMcpServer({
          createSdkMcpServer: sdk.createSdkMcpServer,
          integrations: deps.integrations,
          assistant: deps.assistant,
          personalAssistant: deps.personalAssistant,
          tools: deps.tools,
          browser: deps.browser,
          // The mode filters the tools as on the pi path (`toolNamesForMode`):
          // plan keeps `ask_user` and no acting tool; auto drops the blocking
          // tools but keeps the integration tools, so Autopilot never waits.
          mode: opts.mode,
          nextStepSuggestions: opts.nextStepSuggestions,
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
      // undefined on the Node path (self-host / engine-pod / per-turn Docker +
      // dev/tests): the SDK resolves its own native binary. Only set inside the
      // Bun-compiled desktop sidecar, where require.resolve can't reach it.
      const pathToClaudeCodeExecutable = resolveClaudeExecutable();
      const refreshAuth = makeRefreshAuth(deps);
      // One coherent build-time read for the env AND the digest (the top-of-
      // function `token` read predates the SDK import await, so it is not
      // reused here). Every attempt overrides both with its own fresh read.
      const initialAuth = refreshAuth();
      const baseOptions: Options = {
        cwd: deps.workspaceDir,
        env: initialAuth.env,
        ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
        ...CLAUDE_QUERY_DEFAULTS,
        tools: policy.tools,
        disallowedTools: policy.disallowedTools,
        // Expose Houston's custom tools (ask_user + gated integration tools) via
        // the in-process MCP transport, and auto-allow them so the subprocess
        // runs them without a permission prompt. `tools` above scopes only the
        // BUILT-INS; MCP tools ride alongside and are not filtered by it.
        mcpServers: { [HOUSTON_MCP_SERVER_NAME]: houstonMcp.server },
        allowedTools: houstonMcp.allowedTools,
        // The turn-end stop, plus the workspace guard on every tool call, built
        // from the same `fileGuard` policy as `canUseTool` (tool-gate-hook.ts).
        hooks: buildSessionHooks(deps),
        canUseTool: makeCanUseTool(deps.workspaceDir, deps.fileGuard),
        systemPrompt: buildSystemPrompt(
          deps.workspaceDir,
          withNextStepSuggestions(deps.systemPrompt, opts.nextStepSuggestions),
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
      // A cross-backend rebuild (opts.fresh) must NOT resume a stale SDK
      // session from before the conversation left this backend: the history
      // arrives as a transcript replay on the first prompt (HOU-951), and the
      // old SDK session is missing everything said on the other backend since.
      // Dropping the mapping (transcript stays on disk) makes the first prompt
      // open a brand-new SDK session, whose id is then stored as usual.
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
        // WHICH token the subprocess env carries, for the revoked-token
        // report (PRODUCT-1319) — updated by refreshAuth on every attempt so it
        // always names the token the current attempt runs on (PRODUCT-1355).
        usedAccessDigest: initialAuth.accessDigest,
      });
    },
  };
}

// The SDK subprocess env is built from an allowlist (not a `process.env` spread)
// so no host secret reaches a subprocess that runs model-directed Bash. Kept in
// `./claude-env` and re-exported here so `./title` and `./credential-status`
// keep their `from "./backend"` import.
export { buildClaudeEnv } from "./claude-env";
