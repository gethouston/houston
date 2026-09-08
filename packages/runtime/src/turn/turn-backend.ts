import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ProviderError } from "@houston/runtime-client";
import { readAuthFile, writeAuthFile } from "../auth/auth-file";
import {
  type ClaudeBackendDeps,
  ClaudeBackendUnavailableError,
  createClaudeBackend,
} from "../backends/claude/backend";
import type { BridgedPiTool } from "../backends/claude/custom-tools";
import type { ClaudeLayout } from "../backends/claude/paths";
import { readAnthropicToken } from "../backends/claude/read-token";
import { createSessionsStore } from "../backends/claude/sessions-store";
import { createPiBackend, type PiBackendDeps } from "../backends/pi/backend";
import type { HarnessBackend } from "../backends/types";
import type { ToolSelection } from "../session/tool-selection";
import { makeAskUserTool } from "../session/tools/ask-user";
import { makeClampedFileTools } from "../session/tools/clamped-fs";
import type { WorkspaceGuardOptions } from "../session/tools/fs-guard";
import { makePlanReadyTool } from "../session/tools/plan-ready";
import { makeScrubbedBashTool } from "../session/tools/scrubbed-bash";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session";
import { buildTurnHostTools } from "./turn-toolset";

type TurnTool = PiBackendDeps["customTools"][number];

/**
 * The `get`/`remove` slice of the credential store `readAnthropicToken` needs,
 * over this pooled turn's own `auth.json`.
 *
 * Read fresh from disk per call rather than cached: the pod's credential is
 * re-served between turns, and a cached copy would spawn the SDK on a token the
 * control plane has already replaced. `remove` is the write side of the same
 * contract — when the shared login dir proves the stored entry belongs to a
 * login the user has replaced, the dead entry is dropped instead of being
 * skipped on every future read.
 */
function turnAuthStore(dataDir: string): {
  get: (provider: string) => ReturnType<typeof readAuthFile>[string];
  remove: (provider: string) => void;
} {
  const path = join(dataDir, "auth.json");
  return {
    get: (provider) => readAuthFile(path)[provider],
    remove: (provider) => {
      const creds = readAuthFile(path);
      if (!(provider in creds)) return;
      delete creds[provider];
      writeAuthFile(path, creds);
    },
  };
}

/** Dependencies shared by the pi and Claude pooled-turn backend branches. */
export interface TurnBackendDeps {
  directories: TurnDirectories;
  turn: TurnSessionRequest;
  modelRuntime: ModelRuntime;
  toolSelection: ToolSelection;
  codeSandbox: TurnTool | null;
  systemPrompt: string;
  /**
   * How much of the filesystem this turn's ROLE may touch
   * (`session/coordinator-policy.ts`): shared writable roots for an ordinary
   * agent, an exact-file allowlist for the coordinator. ONE object for BOTH
   * branches below — the wall must not depend on which provider the user is on.
   */
  fileGuard?: WorkspaceGuardOptions;
  claudeSdk?: ClaudeBackendDeps["sdk"];
  claudeSdkLoad?: ClaudeBackendDeps["sdkLoad"];
}

/** Claude directories split between durable conversation state and turn state. */
export interface TurnClaudeLayout extends ClaudeLayout {
  credentialStorageDir: string;
  homeDir: string;
  sessionsFile: string;
}

/** Typed provider failure raised before a backend session can stream events. */
export class TurnBackendProviderError extends Error {
  constructor(
    readonly providerError: ProviderError,
    options?: ErrorOptions,
  ) {
    super(
      providerError.kind === "unknown"
        ? providerError.raw_excerpt
        : providerError.message,
      options,
    );
    this.name = "TurnBackendProviderError";
  }
}

/** Build the per-conversation Claude layout for one disposable turn root. */
export function turnClaudeLayout(
  turnRoot: string,
  dataDir: string,
  conversationId: string,
): TurnClaudeLayout {
  const configDir = join(dataDir, "sessions", conversationId, "claude");
  return {
    configDir,
    sessionsFile: join(configDir, "sessions.json"),
    credentialStorageDir: join(turnRoot, "claude-credstore"),
    homeDir: join(turnRoot, "home"),
  };
}

/** Select and assemble the provider harness for a pooled turn. */
export function createTurnBackend(
  provider: string,
  deps: TurnBackendDeps,
): HarnessBackend {
  const { workspaceDir, dataDir, turnRoot } = deps.directories;
  const hostTools = buildTurnHostTools(deps.turn);
  const commonTools = [
    makeAskUserTool(),
    makePlanReadyTool(),
    ...(deps.codeSandbox ? [deps.codeSandbox] : []),
    ...hostTools,
  ];
  if (provider === "anthropic") {
    const backend = createClaudeBackend({
      workspaceDir,
      readToken: () => readAnthropicToken(turnAuthStore(dataDir)),
      toolSelection: deps.toolSelection,
      systemPrompt: deps.systemPrompt,
      fileGuard: deps.fileGuard,
      layout: turnClaudeLayout(turnRoot, dataDir, deps.turn.conversationId),
      // SAFETY: these are the same pi ToolDefinition objects the MCP bridge
      // accepts; only their heterogeneous schema generics need widening.
      tools: commonTools as unknown as BridgedPiTool[],
      sdk: deps.claudeSdk,
      sdkLoad: deps.claudeSdkLoad,
    });
    return {
      id: backend.id,
      async createSession(options) {
        try {
          return await backend.createSession(options);
        } catch (error) {
          if (error instanceof ClaudeBackendUnavailableError) {
            throw new TurnBackendProviderError(
              {
                kind: "provider_internal",
                provider: "anthropic",
                http_status: null,
                message: "Claude Agent SDK is unavailable in this worker.",
              },
              { cause: error },
            );
          }
          throw error;
        }
      },
    };
  }
  return createPiBackend({
    workspaceDir,
    dataDir,
    modelRuntime: deps.modelRuntime,
    tools: deps.toolSelection.toolNames,
    customTools: [
      ...makeClampedFileTools(workspaceDir, deps.fileGuard ?? {}),
      ...commonTools,
      ...(deps.toolSelection.toolNames.includes("bash")
        ? [makeScrubbedBashTool(workspaceDir)]
        : []),
    ],
  });
}

/** Resolve native Claude continuity, relocating a foreign cwd slug if needed. */
export function resolveTurnClaudeResume(
  directories: TurnDirectories,
  conversationId: string,
): string | undefined {
  const layout = turnClaudeLayout(
    directories.turnRoot,
    directories.dataDir,
    conversationId,
  );
  return createSessionsStore({
    configDir: layout.configDir,
    sessionsFile: layout.sessionsFile,
    cwd: directories.workspaceDir,
  }).resolveResume(conversationId);
}
