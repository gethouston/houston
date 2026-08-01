import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { ToolSelection } from "../../session/tool-selection";
import type { IntegrationToolOptions } from "../../session/tools/integrations";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import { resolveClaudeExecutable } from "./binary-path";
import { buildClaudeEnv } from "./claude-env";
import { buildHoustonMcpServer, HOUSTON_MCP_SERVER_NAME } from "./custom-tools";
import { toSdkModel } from "./model";
import { claudeLoginConfigDir } from "./paths";
import {
  anthropicCredentialStorageDir,
  assertAnthropicScopeCredential,
} from "./scope-guard";
import { type ClaudeQuery, ClaudeSession } from "./session";
import { createSessionsStore } from "./sessions-store";
import { buildSystemPrompt } from "./system-prompt";
import { buildToolPolicy, makeCanUseTool } from "./tool-policy";

/** A resolved Anthropic credential: an OAuth token or a pasted API key. */
export type ClaudeToken =
  | { kind: "oauth-token"; value: string }
  | { kind: "api-key"; value: string };

/** Everything the Claude backend needs to open a session. */
export interface ClaudeBackendDeps {
  workspaceDir: string;
  dataDir: string;
  /** The current Anthropic credential, or undefined when none is connected. */
  readToken: () => ClaudeToken | undefined;
  /** Houston's active tool selection (its code-execution mode gates Bash). */
  toolSelection: ToolSelection;
  /** Houston's product system prompt (full-replace, not the claude_code preset). */
  systemPrompt: string;
  /** Extra roots available to read-only file tools, never Edit/Write/Bash. */
  sharedRoots?: string[];
  /**
   * Integration proxy config when this runtime can reach its host with a sandbox
   * token — the SAME gate the pi path applies (`config.controlPlaneUrl &&
   * config.sandboxToken`). Present → the in-process MCP server also exposes
   * `request_connection` + `integration_search` + `integration_execute`; absent
   * → only `ask_user` (which holds no credential and makes no network call).
   */
  integrations?: IntegrationToolOptions;
}

/** Thrown when the optional Claude Agent SDK is not present in this build. */
export class ClaudeBackendUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Claude backend unavailable in this build");
    this.name = "ClaudeBackendUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

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
 * for another's turn (see `./scope-guard` and
 * knowledge-base/anthropic-credentials.md traps #4 and #6). Team scope (desktop,
 * self-host, every pre-HOU-976 request) and any scope that DOES carry a token are
 * unaffected. A personal scope that DOES carry a token additionally gets its own
 * credential-store dir (`anthropicCredentialStorageDir`), because that token is
 * access-only and can expire MID-TURN — at which point the CLI's own 401 recovery
 * would otherwise re-read that shared dir and finish the turn on the team account.
 */
export function createClaudeBackend(deps: ClaudeBackendDeps): HarnessBackend {
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
        const sdk = await import("@anthropic-ai/claude-agent-sdk");
        query = sdk.query as ClaudeQuery;
        // Build the in-process MCP server that exposes Houston's custom tools to
        // the subprocess. Built here (not at module load) so the optional SDK's
        // `createSdkMcpServer` is only touched once the SDK is confirmed present.
        houstonMcp = buildHoustonMcpServer({
          createSdkMcpServer: sdk.createSdkMcpServer,
          integrations: deps.integrations,
          // The mode does the tool filtering (via `toolNamesForMode`), mirroring
          // the pi path: plan withholds the acting integration tools and keeps
          // only `ask_user`; auto is the inverse — it drops the blocking tools
          // (`ask_user`, `request_connection`) but KEEPS `integration_search` /
          // `integration_execute` so Autopilot can act on the user's apps
          // without ever waiting on them.
          mode: opts.mode,
        });
      } catch (err) {
        throw new ClaudeBackendUnavailableError(err);
      }

      const localBash = deps.toolSelection.toolNames.includes("bash");
      const policy = buildToolPolicy({ localBash, mode: opts.mode });
      // undefined on the Node path (self-host / engine-pod / per-turn Docker +
      // dev/tests): the SDK resolves its own native binary. Only set inside the
      // Bun-compiled desktop sidecar, where require.resolve can't reach it.
      const pathToClaudeCodeExecutable = resolveClaudeExecutable();
      const baseOptions: Options = {
        cwd: deps.workspaceDir,
        env: buildClaudeEnv(
          claudeLoginConfigDir(),
          token,
          // Personal scope: the CLI's credential store moves off the shared dir,
          // so a mid-turn 401 cannot recover onto the team credential. Team
          // scope: undefined, i.e. unchanged (see `./scope-guard`).
          anthropicCredentialStorageDir(deps.dataDir),
        ),
        ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
        settingSources: [],
        tools: policy.tools,
        disallowedTools: policy.disallowedTools,
        // Expose Houston's custom tools (ask_user + gated integration tools) via
        // the in-process MCP transport, and auto-allow them so the subprocess
        // runs them without a permission prompt. `tools` above scopes only the
        // BUILT-INS; MCP tools ride alongside and are not filtered by it.
        mcpServers: { [HOUSTON_MCP_SERVER_NAME]: houstonMcp.server },
        allowedTools: houstonMcp.allowedTools,
        canUseTool: makeCanUseTool(deps.workspaceDir, {
          sharedRoots: deps.sharedRoots,
        }),
        systemPrompt: buildSystemPrompt(
          deps.workspaceDir,
          deps.systemPrompt,
          opts.mode,
          opts.context,
        ),
        includePartialMessages: true,
        permissionMode: "default",
      };

      const sessionsStore = createSessionsStore(
        deps.dataDir,
        deps.workspaceDir,
      );
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
        model: toSdkModel(opts.model.id),
        thinkingLevel: opts.thinkingLevel,
      });
    },
  };
}

// The SDK subprocess env is built from an allowlist (not a `process.env` spread)
// so no host secret reaches a subprocess that runs model-directed Bash. Kept in
// `./claude-env` and re-exported here so `./title` and `./credential-status`
// keep their `from "./backend"` import.
export { buildClaudeEnv } from "./claude-env";
