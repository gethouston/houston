import type { ChatMessage } from "@houston/runtime-client";

/**
 * Cross-BACKEND provider-switch replay (HOU-951). A switch that crosses the
 * backend seam (pi ⇄ Claude Agent SDK) rebuilds the session on the other
 * backend, and neither backend can read the other's session store — so the
 * fresh session would start with zero context and greet the user as a new
 * conversation. Houston's canonical transcript (store/conversations) has every
 * turn regardless of which backend ran it; this module renders that transcript
 * into a preamble exec-turn prepends to the FIRST prompt on the rebuilt
 * session. Riding the first user prompt (not the system prompt) makes the
 * carried context durable: both backends persist the prompt in their own
 * session store, so later rehydrates (process restart, LRU eviction) keep it.
 */

/**
 * Same fit fraction as the same-backend switch decision (`provider-switch.ts`)
 * and the frontend consent dialog (`app/src/lib/provider-switch.ts`): the
 * replayed transcript may use up to this fraction of the target window, leaving
 * headroom for the system prompt, the new turn, and re-tokenization drift.
 */
const REPLAY_FIT_FRACTION = 0.8;

/** ~4 chars per token — the same coarse estimate the frontend dialog uses. */
const CHARS_PER_TOKEN = 4;

/**
 * The character budget for a replay preamble into a model whose effective
 * window is `targetWindowTokens`.
 */
export function replayCharBudget(targetWindowTokens: number): number {
  return Math.max(
    0,
    Math.floor(targetWindowTokens * REPLAY_FIT_FRACTION) * CHARS_PER_TOKEN,
  );
}

export interface ReplayPreamble {
  /** The rendered preamble, ready to prepend to the turn's prompt. */
  text: string;
  /** True when older messages were dropped to fit the budget (lossy carry). */
  truncated: boolean;
}

const HEADER =
  "[Continuing an existing conversation. The transcript below is what has " +
  "already been said in this chat; it ran on a different AI model before " +
  "switching to you. Continue seamlessly: keep all established context, do " +
  "not reintroduce yourself, and do not treat this as a new conversation.]";

const TRUNCATION_NOTE =
  "(Earlier messages were omitted to fit your context window; the transcript below is the most recent part of the conversation.)";

const FOOTER = "[End of transcript. The user's next message follows.]";

/** One transcript line per message; empty (e.g. stop-marker) messages render to null. */
function renderMessage(m: ChatMessage): string | null {
  const toolNames = (m.tools ?? []).map((t) => t.name);
  const body =
    m.content.trim() ||
    (toolNames.length ? `[performed actions: ${toolNames.join(", ")}]` : "");
  if (!body) return null;
  const speaker =
    m.role === "user"
      ? m.author?.name
        ? `User (${m.author.name})`
        : "User"
      : "Assistant";
  return `${speaker}: ${body}`;
}

/**
 * Render the conversation-so-far preamble for a cross-backend rebuild, or null
 * when there is nothing to carry (a brand-new conversation). `currentTurnId`
 * excludes THIS turn's already-recorded user message — it is delivered as the
 * actual prompt, so replaying it too would double it. The newest messages are
 * kept whole and older ones dropped first when the transcript exceeds
 * `charBudget`.
 */
export function renderReplayPreamble(
  messages: ReadonlyArray<ChatMessage>,
  currentTurnId: string,
  charBudget: number,
): ReplayPreamble | null {
  if (charBudget <= 0) return null;
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "user" && m.turnId === currentTurnId) continue;
    const line = renderMessage(m);
    if (line) lines.push(line);
  }
  if (lines.length === 0) return null;

  // Keep the tail: walk newest→oldest until the budget is spent. A single
  // over-budget message is hard-clipped (its tail kept) rather than dropped —
  // the most recent exchange is the context the user most expects to survive.
  const kept: string[] = [];
  let used = 0;
  let clipped = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (used + line.length > charBudget) {
      if (kept.length === 0) {
        kept.unshift(`…${line.slice(line.length - charBudget)}`);
        clipped = true;
      }
      break;
    }
    kept.unshift(line);
    used += line.length + 1;
  }
  const truncated = clipped || kept.length < lines.length;
  return {
    text: [
      HEADER,
      ...(truncated ? [TRUNCATION_NOTE] : []),
      "",
      kept.join("\n\n"),
      "",
      FOOTER,
      "",
    ].join("\n"),
    truncated,
  };
}
