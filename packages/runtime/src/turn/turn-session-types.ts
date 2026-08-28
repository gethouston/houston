import type { TurnMode } from "@houston/protocol";
import type {
  ChatMessage,
  PendingInteraction,
  WireFrame,
} from "@houston/runtime-client";
import type { MessageAuthor } from "../session/attribution";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import type { ProvidedContext } from "../session/workspace-context";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import type { TurnGrantScope } from "./types";

export interface TurnOutcome {
  error?: string;
  /** Interaction the model ended the turn waiting on, if any. */
  pendingInteraction?: PendingInteraction;
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
  nonce?: string;
  pin?: TurnModelPin;
  mode?: TurnMode;
  turnId: string;
  displayText?: string;
  mentions?: ChatMessage["mentions"];
  author?: MessageAuthor;
  context?: ProvidedContext;
  /** Non-secret capability scopes copied from the parsed turn grant. */
  grant?: { scopes: TurnGrantScope[] };
  /** Turn-local routing closure; it owns all grant-bearing calls. */
  sandbox?: { call: SandboxFetch };
  timings?: Record<string, number>;
  /** Setup begun after layout resolution and before bulk hydration completes. */
  startup?: TurnSessionStartupTask;
}

export interface TurnDirectories {
  workspaceDir: string;
  dataDir: string;
  turnRoot: string;
}

export type TurnRunner = (
  directories: TurnDirectories,
  turn: TurnSessionRequest,
) => Promise<TurnOutcome>;
