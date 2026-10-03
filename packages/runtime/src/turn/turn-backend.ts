import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ProviderError } from "@houston/runtime-client";
import {
  type ClaudeBackendDeps,
  ClaudeBackendUnavailableError,
  createClaudeBackend,
} from "../backends/claude/backend";
import type { BridgedPiTool } from "../backends/claude/custom-tools";
import type { ClaudeLayout } from "../backends/claude/paths";
import { readAnthropicToken } from "../backends/claude/read-token";
import { withServedPlan } from "../backends/claude/served-plan";
import { createSessionsStore } from "../backends/claude/sessions-store";
import { createPiBackend, type PiBackendDeps } from "../backends/pi/backend";
import type { HarnessBackend } from "../backends/types";
import type { ToolSelection } from "../session/tool-selection";
import { makeClampedFileTools } from "../session/tools/clamped-fs";
import type { WorkspaceGuardOptions } from "../session/tools/fs-guard";
import { makeScrubbedBashTool } from "../session/tools/scrubbed-bash";
import { turnAuthStore } from "./turn-auth-store";
import { turnCompactions } from "./turn-compactions";
import { POOLED_TURN_TRANSPORT } from "./turn-pi-transport";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session";
import { turnSharedSkillsDir } from "./turn-shared-skills";
import { buildTurnCommonTools } from "./turn-toolset";

type TurnTool = PiBackendDeps["customTools"][number];

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
  const commonTools = buildTurnCommonTools(
    deps.turn,
    deps.codeSandbox,
    dataDir,
  );
  if (provider === "anthropic") {
    const backend = createClaudeBackend({
      workspaceDir,
      readToken: () =>
        withServedPlan(
          readAnthropicToken(turnAuthStore(dataDir)),
          deps.turn.claudePlan,
        ),
      toolSelection: deps.toolSelection,
      systemPrompt: deps.systemPrompt,
      fileGuard: deps.fileGuard,
      personalAssistant: deps.turn.role === "coordinator",
      role: deps.turn.role ?? null,
      layout: turnClaudeLayout(turnRoot, dataDir, deps.turn.conversationId),
      compactions: turnCompactions(dataDir),
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
  const timings = deps.turn.timings;
  return createPiBackend({
    workspaceDir,
    dataDir,
    modelRuntime: deps.modelRuntime,
    // The turn's first answered request and first hedge, on the terminal
    // frame's timingsMs (turn-terminal.ts) beside the other marks.
    hedge: timings
      ? {
          answered() {
            timings.t_first_byte ??= performance.now();
          },
          hedged() {
            timings.t_first_hedge ??= performance.now();
          },
        }
      : undefined,
    // The SAME prompt the Claude branch gets: the capability sentence follows
    // the turn's granted tools, not the provider it landed on.
    systemPrompt: deps.systemPrompt,
    transport: POOLED_TURN_TRANSPORT,
    sharedSkillsDir: turnSharedSkillsDir(turnRoot),
    role: deps.turn.role ?? null,
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
