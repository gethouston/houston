/**
 * The conversation SSE wire frames (protocol v3): the WireEvent payload union
 * and the sequenced stream envelope (WireFrame). Serving/consuming semantics
 * live with the shared ReplayLog + snapshot reducer in @houston/runtime-client.
 */

import type { TokenUsage } from "./conversation";
import type { PendingInteraction } from "./domain/interaction";
import type { ProviderError } from "./provider-error";

/**
 * Live conversation events (SSE), one stream per conversation, strictly
 * id-scoped. Each SSE frame is `data: <WireFrame JSON>` — a WireEvent plus the
 * stream's `seq` cursor (see WireFrame below for the resume semantics).
 *
 * - `sync`  — once on connect (and after an unserviceable resume cursor): is a
 *   turn running + assistant text so far + `seq`, the stream's current
 *   watermark (0 when nothing was ever published in this process), plus
 *   `turnId` — the id of the RUNNING turn (absent when idle), so the client
 *   can tell whether live frames that follow belong to a turn it started or
 *   to another writer's (a teammate, a second tab, a routine). `resync:
 *   true` is set only when the client supplied a resume cursor that could not
 *   be served — the client must treat the stream as fresh (refetch history,
 *   rebuild from this snapshot) instead of splicing.
 * - `user`  — a user message was added (by any client); `nonce` echoes the sender's.
 * - `text` / `thinking` — assistant output deltas.
 * - `tool_start` / `tool_end` — tool activity within the turn.
 * - `usage` — normalized token usage for the turn (when the provider reports it),
 *   emitted before `done`. Drives the context-usage indicator.
 * - `provider_switched` — the conversation moved to a different provider
 *   mid-session; renders a boundary divider and resets the context-usage window.
 * - `provider_error` — the turn's model request failed with a typed provider /
 *   auth / rate-limit / 5xx / network error; renders the matching inline card.
 *   The turn still ends with a normal terminal frame (pi resolves the turn — it
 *   does NOT throw on a provider error), so this never replaces `done`.
 * - `file_changes` — user-visible workspace files this turn created/modified,
 *   emitted once before `done` (only when non-empty). Drives the "files this
 *   mission touched" summary.
 * - `done` / `error` — the turn ended.
 */
export type WireEvent =
  | {
      type: "sync";
      data: {
        running: boolean;
        partial: string;
        seq: number;
        resync?: boolean;
        /** The RUNNING turn's id (see WireFrame.turnId). Absent when idle. */
        turnId?: string;
        /**
         * The running turn's reasoning so far (cumulative, like `partial`).
         * A client attaching mid-turn replays it so the mission log shows the
         * thinking that streamed before it connected (HOU-717). Absent when
         * idle, when the turn produced none, or from a pre-field server.
         */
        thinking?: string;
        /**
         * The running turn's tool calls so far, in stream order. `isError`
         * present means the tool has ENDED (with that error flag); absent
         * means it is still running — only the last entry can be. Same
         * absence semantics as `thinking`.
         */
        tools?: { name: string; input?: unknown; isError?: boolean }[];
      };
    }
  | {
      type: "user";
      data: {
        content: string;
        ts: number;
        nonce?: string;
        /**
         * Multiplayer only: who sent this message (C5), so a live client
         * attributes it to the teammate who wrote it — matching the persisted
         * `ChatMessage.author`. Absent in single-player mode.
         */
        author?: { userId: string; name?: string };
      };
    }
  | { type: "text"; data: string }
  | { type: "thinking"; data: string }
  | { type: "tool_start"; data: { name: string; args: unknown } }
  | { type: "tool_end"; data: { name: string; isError: boolean } }
  | { type: "usage"; data: TokenUsage }
  | {
      /**
       * The conversation moved to a different provider mid-session. The runtime
       * re-pointed the live session to the new provider, carrying the full prior
       * history verbatim when it fit (`summarized: false`) or compacting it to
       * fit a smaller window first (`summarized: true`). `provider` is the pi
       * provider id switched TO; `pre_tokens` is the leaving provider's last
       * context fill. Drives the chat's boundary divider + the context-usage
       * window reset.
       */
      type: "provider_switched";
      data: {
        provider: string;
        summarized: boolean;
        pre_tokens?: number | null;
      };
    }
  | {
      /**
       * The runtime compacted this conversation's context before running the
       * turn: at/over the autocompact threshold of the active model's window,
       * earlier turns are summarized so long chats keep working (`proactive`;
       * `native` is reserved for a provider's own compaction). Renders a
       * boundary divider and resets the context-usage window; persisted on the
       * turn's assistant message (`ChatMessage.compaction`) for reload replay.
       */
      type: "context_compacted";
      data: {
        trigger: "native" | "proactive";
        pre_tokens?: number | null;
      };
    }
  | {
      /**
       * The turn's model request failed with a typed provider error
       * (401/403/session-ended → unauthenticated, 429 → rate_limited, 5xx →
       * provider_internal, network → network_unreachable, else unknown).
       * Published live so the chat renders the matching reconnect / rate-limit
       * card, and persisted on the turn's assistant message
       * (`ChatMessage.providerError`) so the card survives a reload. pi resolves
       * the turn rather than throwing, so a normal terminal frame (`done`) still
       * follows — this is NOT a substitute for it.
       */
      type: "provider_error";
      data: ProviderError;
    }
  | {
      /**
       * User-visible files this turn created or modified in the agent's
       * workspace (relative paths, filtered to user-deliverable file types).
       * Emitted at most once per turn, after the model finished and before
       * `done`, and only when the diff is non-empty. Also persisted on the
       * turn's assistant `ChatMessage.fileChanges` so it survives a reload.
       */
      type: "file_changes";
      data: { created: string[]; modified: string[] };
    }
  | {
      /**
       * The turn ended normally. `pendingInteraction` is present only when the
       * model finished by asking the user for something (ask_user /
       * request_connection) — the turn settles the board card to `needs_you`
       * and carries the interaction to render; absent means the card settles to
       * `done`. Also persisted on the turn's assistant `ChatMessage` so it
       * survives a reload.
       */
      type: "done";
      data: null;
      pendingInteraction?: PendingInteraction;
    }
  | { type: "error"; data: { message: string } };

export type WireEventType = WireEvent["type"];

/**
 * A conversation-stream frame: a WireEvent plus its position in the stream.
 * `seq` is per-conversation, strictly monotonic starting at 1, assigned at
 * publish time by the stream's ONE fan-out authority (the runtime's bus; the
 * host's turn relay for cloudrun conversations). The authority stamps every
 * frame itself — an upstream seq is never trusted or passed through, so there
 * is exactly one sequencing authority per stream. The counter lives for the
 * authority's process lifetime — it is never reset when the replay buffer is
 * cleared at turn end.
 *
 * `turnId` identifies the turn a frame belongs to. The turn's server mints one
 * id (a UUID) when the turn starts and stamps it on every turn-scoped frame it
 * publishes (`user`, `text`, `thinking`, `tool_start`, `tool_end`, `usage`,
 * `provider_switched`, `provider_error`, `file_changes`, `done`, `error` — including terminal
 * frames the relay synthesizes for a dead turn). The same id is persisted on
 * the turn's user + assistant `ChatMessage`s, so a client resyncing across a
 * turn boundary can match history to a live turn — and, crucially, can tell a
 * frame from ANOTHER writer's turn (a teammate, a second tab, a routine) apart
 * from its own instead of splicing it in. `sync` frames carry the running
 * turn's id inside `data.turnId` instead of the envelope.
 *
 * Resume: each frame is written with an SSE `id: <seq>` line, and a client
 * reconnects with `?after=<seq>` (query wins) or the standard `Last-Event-ID`
 * header. Frames still inside the server's replay window (the in-flight turn,
 * capped) are re-sent in order — no gap, no duplicate, no `sync`. A cursor
 * that cannot be served (older than the window, or from before a restart)
 * gets a fresh `sync` carrying `resync: true` + the current watermark instead.
 *
 * `seq` and `turnId` are optional on the type for wire compatibility only:
 * the server always sets `seq` on conversation event streams, and always
 * stamps `turnId` on turn-scoped frames.
 */
export type WireFrame = WireEvent & { seq?: number; turnId?: string };
