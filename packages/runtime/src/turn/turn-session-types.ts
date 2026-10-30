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
import type { InTreeMissionTitle } from "./turn-mission-title-outcome";
import type { RemoteActivityReader } from "./turn-mission-title-remote";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import type { TurnGrantScope } from "./types";

export interface TurnOutcome {
  error?: string;
  stopReason?: ChatMessage["stopReason"];
  /** Interaction the model ended the turn waiting on, if any. */
  pendingInteraction?: PendingInteraction;
  /** A new mission's after-turn title, as written in the tree (pre-sync). */
  missionTitle?: InTreeMissionTitle;
  /** What the turn spent, for the agent's token ledger (turn-ledger.ts). */
  spend?: { provider: string; usage: TokenUsage };
  /** Per-call timings for the terminal frame (turn-terminal.ts). */
  modelCalls?: ModelCallReport;
}

/** Per-turn model/effort pin. Absent means inherit the agent setting. */
export interface TurnModelPin {
  model?: string | null;
  effort?: string | null;
}

/** Everything one pooled model session needs. */
export interface TurnSessionRequest {
  conversationId: string;
  text: string;
  provider: string;
  emit: (e: WireFrame) => void;
  signal: AbortSignal | undefined;
  /** The heartbeat stop state, read before the agent loop settles. */
  stopReason?: () => ChatMessage["stopReason"];
  nonce?: string;
  pin?: TurnModelPin;
  mode?: TurnMode;
  nextStepSuggestions?: boolean;
  liveMode?: import("../session/turn-mode-context").TurnModeRef;
  turnId: string;
  displayText?: string;
  mentions?: ChatMessage["mentions"];
  /** A new mission's first send: title its card after the reply. */
  missionTitle?: MissionTitleRequest;
  /**
   * This turn is a routine's own fire (`TurnRequest.routine`), not a person
   * chatting in the routine's chat. Only fires start on a fresh session
   * (session/routine-context.ts).
   */
  routineFire?: boolean;
  /** Fresh read of the stored board doc, for a card hydration missed. */
  readRemoteActivity?: RemoteActivityReader;
  author?: MessageAuthor;
  /** The plan the gateway served with this turn's Claude token, bound to it. */
  claudePlan?: ClaudePlanBinding;
  context?: ProvidedContext;
  /**
   * When the turn's host token expires (epoch ms, turn-deadline.ts), read at
   * acceptance: work that must finish before the final sync ends before it.
   */
  tokenExpiresAt?: number;
  /** Non-secret capability scopes copied from the parsed turn grant. */
  grant?: { scopes: TurnGrantScope[] };
  /**
   * `coordinator` when this turn IS the user's AI Manager, as the gateway
   * marked it. Decides the tool surface, the file wall and the prompt for
   * this turn alone: a pool worker serves Houston and an ordinary agent from
   * the same process.
   */
  role?: AssistantRuntimeRole;
  /**
   * Turn-local routing closure; it owns all grant-bearing calls. `warmCode`
   * starts the turn's code VM booting (`vm` mode only).
   */
  sandbox?: TurnSandboxHandle;
  timings?: Record<string, number>;
  /** Setup begun after layout resolution and before bulk hydration completes. */
  startup?: TurnSessionStartupTask;
}

export interface TurnSandboxHandle {
  call: SandboxFetch;
  warmCode?: () => void;
}

export interface TurnDirectories {
  workspaceDir: string;
  dataDir: string;
  turnRoot: string;
  /** Hydration deferred past the prompt (turn-deferred-files.ts). */
  workspaceReady?: Promise<void>;
  /** Called once the prompt ends or is stopped (turn-deferred-watch.ts). */
  abandonDeferred?: () => void;
  /** Archive segments left remote, fetched on demand (turn-archive-fetch.ts). */
  loadArchive?: ArchiveLoader;
}

export type TurnRunner = (
  directories: TurnDirectories,
  turn: TurnSessionRequest,
) => Promise<TurnOutcome>;
