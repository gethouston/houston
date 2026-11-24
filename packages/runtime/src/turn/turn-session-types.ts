import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import type { ModelCallReport, TurnMode } from "@houston/protocol";
import type {
  ChatMessage,
  PendingInteraction,
  TokenUsage,
  WireFrame,
} from "@houston/runtime-client";
import type { ClaudePlanBinding } from "../auth/claude-plan";
import type { MessageAuthor } from "../session/attribution";
import type { MissionTitleRequest } from "../session/mission-title";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import type { ProvidedContext } from "../session/workspace-context";
import type { ArchiveLoader } from "./turn-archive-fetch";
import type { DeferredGate } from "./turn-deferred-gate";
import type { InTreeMissionTitle } from "./turn-mission-title-outcome";
import type { RemoteActivityReader } from "./turn-mission-title-remote";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import type { TurnGrantScope } from "./types";

export interface TurnOutcome {
  error?: string;
  stopReason?: ChatMessage["stopReason"];
  pendingInteraction?: PendingInteraction;
  missionTitle?: InTreeMissionTitle;
  spend?: { provider: string; usage: TokenUsage };
  modelCalls?: ModelCallReport;
}

export interface TurnModelPin {
  model?: string | null;
  effort?: string | null;
}

export interface TurnSessionRequest {
  conversationId: string;
  text: string;
  provider: string;
  emit: (e: WireFrame) => void;
  signal: AbortSignal | undefined;
  stopReason?: () => ChatMessage["stopReason"];
  nonce?: string;
  pin?: TurnModelPin;
  mode?: TurnMode;
  nextStepSuggestions?: boolean;
  timezone?: string;
  liveMode?: import("../session/turn-mode-context").TurnModeRef;
  turnId: string;
  displayText?: string;
  mentions?: ChatMessage["mentions"];
  missionTitle?: MissionTitleRequest;
  routineFire?: boolean;
  readRemoteActivity?: RemoteActivityReader;
  author?: MessageAuthor;
  claudePlan?: ClaudePlanBinding;
  context?: ProvidedContext;
  tokenExpiresAt?: number;
  grant?: { scopes: TurnGrantScope[] };
  role?: AssistantRuntimeRole;
  sandbox?: { call: SandboxFetch };
  timings?: Record<string, number>;
  startup?: TurnSessionStartupTask;
}

export interface TurnDirectories {
  workspaceDir: string;
  dataDir: string;
  turnRoot: string;
  workspaceReady?: Promise<void>;
  abandonDeferred?: () => void;
  deferredGate?: DeferredGate;
  loadArchive?: ArchiveLoader;
}

export type TurnRunner = (
  directories: TurnDirectories,
  turn: TurnSessionRequest,
) => Promise<TurnOutcome>;
