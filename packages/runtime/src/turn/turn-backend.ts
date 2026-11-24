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
import { createPiBackend, type PiBackendDeps } from "../backends/pi/backend";
import type { HarnessBackend } from "../backends/types";
import type { ToolSelection } from "../session/tool-selection";
import { makeClampedFileTools } from "../session/tools/clamped-fs";
import type { WorkspaceGuardOptions } from "../session/tools/fs-guard";
import { makeScrubbedBashTool } from "../session/tools/scrubbed-bash";
import { turnAuthStore } from "./turn-auth-store";
import { turnCompactions } from "./turn-compactions";
import { deferredToolGate, gateTurnTools } from "./turn-deferred-files";
import { POOLED_TURN_TRANSPORT } from "./turn-pi-transport";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session";
import { turnSharedSkillsDir } from "./turn-shared-skills";
import { buildTurnBrowserTool, buildTurnCommonTools } from "./turn-toolset";

type TurnTool = PiBackendDeps["customTools"][number];

export interface TurnBackendDeps {
  directories: TurnDirectories;
  turn: TurnSessionRequest;
  modelRuntime: ModelRuntime;
  toolSelection: ToolSelection;
  codeSandbox: TurnTool | null;
  systemPrompt: string;
  fileGuard?: WorkspaceGuardOptions;
  claudeSdk?: ClaudeBackendDeps["sdk"];
  claudeSdkLoad?: ClaudeBackendDeps["sdkLoad"];
}

export interface TurnClaudeLayout extends ClaudeLayout {
  credentialStorageDir: string;
  homeDir: string;
  sessionsFile: string;
}

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

export function createTurnBackend(
  provider: string,
  deps: TurnBackendDeps,
): HarnessBackend {
  const { workspaceDir, dataDir, turnRoot, deferredGate, loadArchive } =
    deps.directories;
  const commonTools = [
    ...buildTurnCommonTools(deps.turn, deps.codeSandbox, dataDir, loadArchive),
    ...buildTurnBrowserTool(
      deps.toolSelection,
      workspaceDir,
      deps.turn.grant?.scopes.includes("browser-live") === true,
      deps.turn.tokenExpiresAt,
    ),
  ];
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
      ...(deferredGate
        ? { beforeTool: deferredToolGate(deferredGate, workspaceDir) }
        : {}),
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
    systemPrompt: deps.systemPrompt,
    transport: POOLED_TURN_TRANSPORT,
    sharedSkillsDir: turnSharedSkillsDir(turnRoot),
    role: deps.turn.role ?? null,
    tools: deps.toolSelection.toolNames,
    customTools: gateTurnTools(
      [
        ...makeClampedFileTools(workspaceDir, deps.fileGuard ?? {}),
        ...commonTools,
        ...(deps.toolSelection.toolNames.includes("bash")
          ? [makeScrubbedBashTool(workspaceDir)]
          : []),
      ],
      deferredGate,
      workspaceDir,
    ),
  });
}
