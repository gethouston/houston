/**
 * The option bags {@link HoustonEngineClient}'s two LIVE calls take — the SSE
 * subscription and the send that triggers a turn.
 *
 * Separated from the client the way `./resume-contract.ts` and
 * `./global-events-contract.ts` are: a caller building a send (the app's
 * composer, the queue, a routine) reads the field docs here without pulling in
 * the client, and the two files stay independently readable.
 */

import type { WireFrame } from "./types";

export interface EventStreamOptions {
  /** Abort to close the stream (e.g. when switching conversations). */
  signal?: AbortSignal;
  /**
   * Resume cursor (`?after=<seq>`): the server replays only frames with
   * `seq > after` from its in-flight-turn buffer — no `sync`, no gap, no
   * duplicate. An unserviceable cursor gets a `sync` with `resync: true`
   * instead. Omit for the fresh-connect contract (`sync`, then live frames).
   */
  after?: number;
  /** Called for every event scoped to this conversation. */
  onEvent: (event: WireFrame) => void;
  /**
   * Called whenever ANY bytes arrive on the stream — including SSE comment
   * frames (": connected", ": hb" heartbeats) that never reach `onEvent`.
   * Feeds idle watchdogs (see `streamEventsResumable`): a server heartbeating
   * every 15s keeps this firing even when no turn is running.
   */
  onActivity?: () => void;
}

export interface SendOptions {
  /** Durable retry identity (1–256 characters), echoed live and persisted on the user message. */
  nonce?: string;
  /**
   * Per-turn provider pin (engine provider id). The turn runs on THIS provider
   * — never auth-gated onto another one — exactly like a routine's pin. Chats
   * pass their own pinned provider here so a conversation always runs on the
   * provider the user picked IN that chat, regardless of the agent-wide
   * settings (HOU-695). Omitted, the runtime resolves from its settings.
   */
  provider?: string;
  /** Per-turn model pin (must belong to `provider`). */
  model?: string;
  /** Per-turn reasoning-effort pin. */
  effort?: string;
  /**
   * Per-turn execution mode. "execute" (the default for an unpinned turn) =
   * full read/write/act; "plan" = read-only tools plus a planning overlay;
   * "auto" (Autopilot) = acts with everything except the blocking tools, never
   * waiting on the user. Omitted, the runtime runs the turn as "execute".
   * Mirrors the protocol's `TurnMode` (kept inline — this package stays zero-dep,
   * like `effort`).
   */
  mode?: "execute" | "plan" | "auto";
  /**
   * What renders as the user's chat bubble, when it must differ from `text`
   * (the real prompt the model runs on). Presentation-only: persisted alongside
   * the user message so a history reload renders `displayText ?? content`, while
   * the model always received `text`. Omitted when the bubble and prompt match.
   */
  displayText?: string;
  /**
   * The teammates this message @mentions (HOU-944): structure only — the model
   * runs on the plain "@Name" text inside `text` either way. Persisted on the
   * user message and echoed on the `user` frame, so a reloaded transcript chips
   * the same names the sent bubble did. Omitted when the message mentions
   * nobody; never an empty list. (Kept inline — this package stays zero-dep,
   * like `mode` and `effort`.)
   */
  mentions?: { userId: string; name?: string }[];
  /**
   * The approval cards this message answers: the host-issued request id and
   * what the person said about it. The host is the ONLY reader — it records the
   * receipts as the message passes through and drops the field before the
   * runtime ever sees it, because a model that could author one could authorize
   * its own destructive call. Omitted when the message answers no card; never
   * an empty list. (Kept inline — this package stays zero-dep, like `mode`.)
   */
  approvals?: { requestId: string; decision: "approve" | "deny" }[];
  signal?: AbortSignal;
}
