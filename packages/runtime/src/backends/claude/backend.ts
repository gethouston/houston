import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { ToolSelection } from "../../session/tool-selection";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import { resolveClaudeExecutable } from "./binary-path";
import { toSdkModel } from "./model";
import { claudeLoginConfigDir } from "./paths";
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
 * subprocess environment, so `process.env` is spread to keep PATH/HOME while
 * pinning the config dir + any degraded-fallback token.
 */
export function createClaudeBackend(deps: ClaudeBackendDeps): HarnessBackend {
  return {
    // The pi provider id this backend serves turns for (the registry maps
    // `model.provider` → backend). Houston's native Anthropic provider is
    // `anthropic`, so it must register under exactly that.
    id: "anthropic",
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      let query: ClaudeQuery;
      try {
        const sdk = await import("@anthropic-ai/claude-agent-sdk");
        query = sdk.query as ClaudeQuery;
      } catch (err) {
        throw new ClaudeBackendUnavailableError(err);
      }

      const localBash = deps.toolSelection.toolNames.includes("bash");
      const policy = buildToolPolicy({ localBash });
      // undefined on the Node path (self-host / engine-pod / per-turn Docker +
      // dev/tests): the SDK resolves its own native binary. Only set inside the
      // Bun-compiled desktop sidecar, where require.resolve can't reach it.
      const pathToClaudeCodeExecutable = resolveClaudeExecutable();
      const baseOptions: Options = {
        cwd: deps.workspaceDir,
        env: buildClaudeEnv(claudeLoginConfigDir(), deps.readToken()),
        ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
        settingSources: [],
        tools: policy.tools,
        disallowedTools: policy.disallowedTools,
        canUseTool: makeCanUseTool(deps.workspaceDir),
        systemPrompt: buildSystemPrompt(
          deps.workspaceDir,
          deps.systemPrompt,
          opts.context,
        ),
        includePartialMessages: true,
        permissionMode: "default",
      };

      return new ClaudeSession({
        query,
        conversationId: opts.conversationId,
        baseOptions,
        sessionsStore: createSessionsStore(deps.dataDir),
        model: toSdkModel(opts.model.id),
        thinkingLevel: opts.thinkingLevel,
      });
    },
  };
}

/**
 * Every env var the Claude Agent SDK reads to authenticate. The SDK honors all
 * three (verified in the installed `sdk.mjs`): a setup/OAuth token via
 * `CLAUDE_CODE_OAUTH_TOKEN`, and an API key via either `ANTHROPIC_API_KEY` or
 * the `ANTHROPIC_AUTH_TOKEN` alias. We clear ALL of them before setting the one
 * for the connected credential, so exactly one survives.
 */
const CREDENTIAL_ENV_VARS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
] as const;

/**
 * The single Anthropic auth env var for a credential (empty when none is
 * connected): a setup/OAuth token via `CLAUDE_CODE_OAUTH_TOKEN`, an API key via
 * `ANTHROPIC_API_KEY`.
 */
function tokenEnv(token: ClaudeToken | undefined): Record<string, string> {
  if (token?.kind === "oauth-token")
    return { CLAUDE_CODE_OAUTH_TOKEN: token.value };
  if (token?.kind === "api-key") return { ANTHROPIC_API_KEY: token.value };
  return {};
}

/**
 * Build the SDK subprocess env carrying EXACTLY the connected credential.
 *
 * `options.env` REPLACES the subprocess environment, so we spread `process.env`
 * to keep PATH/HOME, pin the ISOLATED config dir, then make the credential vars
 * deterministic: DELETE all three first, then set the one for the connected
 * token. A stale/ambient `ANTHROPIC_API_KEY` on the host must never survive
 * alongside a user's OAuth token — otherwise a subscription turn could silently
 * bill the machine's (or Houston's) API key. Shared by the turn backend and the
 * one-shot title path (`./title`) so both scrub identically.
 */
export function buildClaudeEnv(
  configDir: string,
  token: ClaudeToken | undefined,
): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env,
    CLAUDE_CONFIG_DIR: configDir,
  };
  for (const key of CREDENTIAL_ENV_VARS) delete env[key];
  Object.assign(env, tokenEnv(token));
  return env;
}
