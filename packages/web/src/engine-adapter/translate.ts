import type { ChatMessage } from "@houston/runtime-client";
import { EngineError, FatalResumeError } from "@houston/runtime-client";
import type { ChatHistoryEntry } from "../../../../ui/engine-client/src/types";
import { toOldProvider } from "./synthetic";

/**
 * A turn that fails on the SEND (e.g. no provider connected → the runtime answers
 * 409) rejects with an EngineError wrapping the runtime's JSON body. Unwrap it to
 * the plain message the engine sent, so the chat shows "No provider connected. Log
 * in with Claude or Codex first." rather than a raw `engine request failed (409):
 * {…}` string (the product voice never shows status codes or JSON to the user).
 * A fatal stream refusal (FatalResumeError) unwraps to the EngineError it carries.
 */
export function turnErrorMessage(e: unknown): string {
  if (e instanceof FatalResumeError) e = e.cause;
  if (e instanceof EngineError) {
    try {
      const body = JSON.parse(e.body) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* body wasn't JSON — fall through to the generic message */
    }
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Whether a turn failure is the runtime's "no provider connected" refusal — the
 * verbatim message it raises when the chat's provider is logged out (runtime
 * `ai/providers.ts`, `transport/server.ts`, `turn/server.ts`; all prefixed
 * "No provider connected."). This is a HANDLED, recoverable state surfaced by
 * the in-chat reconnect card, not a turn failure, so the UI settles it cleanly
 * rather than rendering it as an error.
 */
export function isNotConnectedError(message: string): boolean {
  return message.toLowerCase().includes("no provider connected");
}

/**
 * Whether a turn's terminal error is the user pressing Stop — the verbatim
 * message the runtime (and the control plane's relay) emit on a cancel. This is
 * an intentional, handled stop, not a turn failure, so the UI shows the message
 * but settles the card back to the user (needs_you), never the red error state.
 */
export function isStoppedByUser(message: string): boolean {
  return message.includes("Stopped by user");
}

/** Convert new-engine history (ChatMessage[]) into old FeedItem[] for replay. */
export function historyToFeed(messages: ChatMessage[]): ChatHistoryEntry[] {
  const out: ChatHistoryEntry[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      // Carry the author (C5) so a shared conversation attributes each teammate's
      // bubble on reload. Absent in single-player mode → the bubble is unchanged.
      out.push({
        feed_type: "user_message",
        data: m.content,
        author: m.author,
      });
    } else {
      // A persisted provider switch: replay the boundary divider before this
      // turn's content so it survives a reload (and the window estimate resets).
      if (m.providerSwitch) {
        out.push({
          feed_type: "provider_switched",
          data: {
            provider: toOldProvider(m.providerSwitch.provider),
            summarized: m.providerSwitch.summarized,
            pre_tokens: m.providerSwitch.pre_tokens,
          },
        });
      }
      // A persisted provider failure: replay the typed card so the inline
      // reconnect / rate-limit surface survives a reload (the dedup in
      // feedItemsToMessages keeps one card per (kind, provider) per turn).
      if (m.providerError) {
        out.push({
          feed_type: "provider_error",
          data: {
            ...m.providerError,
            provider: toOldProvider(m.providerError.provider),
          },
        });
      }
      for (const t of m.tools ?? []) {
        out.push({ feed_type: "tool_call", data: { name: t.name, input: {} } });
        out.push({
          feed_type: "tool_result",
          data: { content: "", is_error: !!t.isError },
        });
      }
      if (m.content) out.push({ feed_type: "assistant_text", data: m.content });
      // Replay the turn's usage as a final_result (which only flushes, never
      // renders a bubble) so the context-usage indicator survives a reload.
      if (m.usage) {
        out.push({
          feed_type: "final_result",
          data: {
            result: m.content,
            cost_usd: null,
            duration_ms: null,
            usage: m.usage,
          },
        });
      }
    }
  }
  return out;
}
