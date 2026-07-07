import type { WireEvent } from "@houston/runtime-client";
import type { PiThinkingLevel } from "../ai/effort";
import type { ProvidedContext } from "../session/workspace-context";

/**
 * The HarnessBackend seam: turn execution abstracted behind a provider-agnostic
 * port so a provider can plug in its own harness. pi (`./pi`) is the default and
 * only implementation today; both the long-lived server (session/) and the
 * per-request cloud runtime (turn/) drive turns through this interface, never a
 * pi type. The wire dialect they emit stays identical — a `HarnessSession`
 * delivers `WireEvent`s, the same union the web client and the control-plane
 * relay speak.
 */

/**
 * pi's reasoning levels, re-exported under a provider-neutral name. Aliased (not
 * renamed) from `../ai/effort` so the seam speaks in its own vocabulary while the
 * pi-flavored literal keeps its home next to the effort mapping.
 */
export type ThinkingLevel = PiThinkingLevel;

/**
 * The minimal, provider-agnostic view of a resolved model a backend needs to run
 * and size a turn. A pi `Model<Api>` is structurally assignable to this, so the
 * server / cloud call sites pass their resolved pi model straight through with no
 * pi import leaking into the seam.
 */
export interface ResolvedModel {
  readonly provider: string;
  readonly id: string;
  readonly contextWindow: number;
  readonly reasoning?: boolean;
}

/**
 * One live conversation session against a backend. `prompt` resolves at turn end;
 * a provider failure arrives as a `provider_error` WireEvent on the stream, never
 * a throw. `dispose` is idempotent.
 */
export interface HarnessSession {
  /** Subscribe to this session's wire events. Returns an unsubscribe fn. */
  subscribe(listener: (e: WireEvent) => void): () => void;
  /** Run one turn; resolves at turn end. Provider errors surface as WireEvents. */
  prompt(text: string): Promise<void>;
  /** Abort the in-flight turn (the user's Stop), then settle. */
  abort(): Promise<void>;
  /** Tear down the session and its listeners. Idempotent. */
  dispose(): void;
  /** Re-point the live session at a different model (cross-provider allowed). */
  setModel(model: ResolvedModel): Promise<void>;
  /** Summarize the conversation so it fits a smaller window. */
  compact(): Promise<void>;
  /** Set the reasoning level for subsequent turns (clamped to the model). */
  setThinkingLevel(level: ThinkingLevel): void;
  /** The current context fill, or undefined when unknown. */
  getContextUsage(): { tokens: number | null } | undefined;
}

/** What a backend needs to open a session for one conversation. */
export interface CreateSessionOptions {
  conversationId: string;
  model: ResolvedModel;
  thinkingLevel?: ThinkingLevel;
  /**
   * Gateway-provided workspace + user context for the prompt (HOU-711, cloud).
   * Present when the hosting gateway sourced it from Supabase and put it on the
   * turn body; absent on local/self-host, where the runtime reads the two
   * WORKSPACE.md / USER.md files instead.
   */
  context?: ProvidedContext;
}

/** A pluggable turn-execution backend for a provider. */
export interface HarnessBackend {
  readonly id: string;
  createSession(opts: CreateSessionOptions): Promise<HarnessSession>;
}
