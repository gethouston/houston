import { getOverflowPatterns } from "@earendil-works/pi-ai";
import {
  estimateTokens,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";

/**
 * Sizing rules for the compaction guard's bounded summarization requests
 * (HOU-709, PRODUCT-1394). The guard (compaction-guard.ts) is the ONLY seam
 * between a conversation's full history and the single summarization request
 * pi serializes it into, so every size limit lives here.
 */

type Preparation = SessionBeforeCompactEvent["preparation"];
export type AgentMessage = Preparation["messagesToSummarize"][number];

/**
 * Fraction of the model's context window the summarization request's input
 * may use (as estimated by pi's chars/4 heuristic). The remainder absorbs the
 * estimate's error, the summarizer's prompt scaffolding, and the reserved
 * summary output — generous because a too-big request is a wedged
 * conversation, while a too-small one only loses some old context to the
 * drop notice.
 */
export const SUMMARIZER_INPUT_FRACTION = 0.7;

/**
 * Absolute ceiling on the summarizer input's ESTIMATED tokens, independent of
 * the model's window. The estimate is exactly chars/4, so this caps the
 * serialized conversation at ~8,000,000 chars — comfortably under OpenAI's
 * hard 10,485,760-char limit on any single content string (PRODUCT-1394: a
 * 31MB serialization was rejected with "string too long", and a request that
 * can never shrink wedges the conversation forever). Only binds for context
 * windows above ~2.9M tokens; every current model is bounded by the window
 * fraction first.
 */
export const SUMMARIZER_INPUT_MAX_TOKENS = 2_000_000;

/** The summarizer's input token budget for a model window (0 = unknown). */
export function summarizerInputBudget(contextWindow: number): number {
  return Math.min(
    Math.floor(contextWindow * SUMMARIZER_INPUT_FRACTION),
    SUMMARIZER_INPUT_MAX_TOKENS,
  );
}

/**
 * A provider rejection caused by the REQUEST'S SIZE (context window or
 * byte/char caps) — deterministic: resending the same or a bigger input can
 * never succeed, so the guard must shrink, never defer to pi's unbounded
 * default. Everything else (rate limits, network blips, 5xx) stays on the
 * defer-and-retry-next-turn path. Reuses pi-ai's per-provider overflow
 * patterns, minus its throttling exclusions ("Too many tokens, please wait"
 * is a rate limit), plus OpenAI's per-string cap wording the patterns miss.
 */
export function isInputSizeRejection(message: string): boolean {
  if (/rate limit|too many requests|throttl/i.test(message)) return false;
  // OpenAI's 10 MiB per-content-string cap: "Invalid 'input[0].content[0]
  // .text': string too long. Expected a string with maximum length 10485760…"
  if (/string too long/i.test(message)) return true;
  return getOverflowPatterns().some((p) => p.test(message));
}

export interface BoundResult {
  kept: AgentMessage[];
  dropped: number;
  /** 1 when the newest message was too big alone and its middle was elided. */
  elided: number;
}

/**
 * Keep the NEWEST messages whose estimated tokens fit the budget — the same
 * newest-first accumulation pi's branch summarization uses, so what survives
 * is the context closest to the work in flight. When the newest message ALONE
 * overflows the budget, its middle is elided (head + tail kept with an
 * explicit marker) instead of losing the entire history to the deterministic
 * fallback. Returns the kept slice in chronological order plus how many older
 * messages fell off.
 */
export function boundMessages(
  messages: AgentMessage[],
  budget: number,
): BoundResult {
  const kept: AgentMessage[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const cost = estimateTokens(message);
    if (total + cost > budget) break;
    total += cost;
    kept.unshift(message);
  }
  if (kept.length === 0 && messages.length > 0) {
    const newest = messages[messages.length - 1];
    const elided = newest ? elideMessage(newest, budget) : undefined;
    if (elided) {
      return { kept: [elided], dropped: messages.length - 1, elided: 1 };
    }
  }
  return { kept, dropped: messages.length - kept.length, elided: 0 };
}

const ELISION_MARKER = (chars: number) =>
  `\n[... ${chars} characters elided to fit the summarization budget ...]\n`;

/** Keep a text's head + tail within `maxChars`, marking the elided middle. */
export function elideMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = ELISION_MARKER(text.length - maxChars);
  const keep = maxChars - marker.length;
  if (keep < 2) return text.slice(0, Math.max(0, maxChars));
  const head = Math.ceil(keep / 2);
  return text.slice(0, head) + marker + text.slice(text.length - (keep - head));
}

interface TextSlot {
  get(): string;
  set(value: string): void;
}

/** Writable views over every text field `estimateTokens` counts for a message. */
function textSlots(message: AgentMessage): TextSlot[] {
  // Structural access: AgentMessage is a closed pi union, but the fields we
  // touch are plain strings; a slot is only produced for a string field.
  const m = message as unknown as Record<string, unknown>;
  const slot = (owner: Record<string, unknown>, key: string): TextSlot[] => {
    const value = owner[key];
    if (typeof value !== "string" || value.length === 0) return [];
    return [
      {
        get: () => owner[key] as string,
        set(next: string) {
          owner[key] = next;
        },
      },
    ];
  };
  const blockSlots = (allowed: string[]): TextSlot[] => {
    if (!Array.isArray(m.content)) return [];
    return (m.content as Record<string, unknown>[]).flatMap((block) => {
      const type = block?.type;
      if (typeof type !== "string" || !allowed.includes(type)) return [];
      return slot(block, type === "thinking" ? "thinking" : "text");
    });
  };
  switch (message.role) {
    case "user":
    case "custom":
    case "toolResult":
      if (typeof m.content === "string") return slot(m, "content");
      return blockSlots(["text"]);
    case "assistant":
      return blockSlots(["text", "thinking"]);
    case "bashExecution":
      return slot(m, "output");
    case "branchSummary":
    case "compactionSummary":
      return slot(m, "summary");
    default:
      return [];
  }
}

/**
 * A copy of `message` with each text field's middle elided so the whole
 * message estimates within `budget` tokens, or undefined when its bulk is not
 * in elidable text (then the caller falls back to the deterministic path).
 */
export function elideMessage(
  message: AgentMessage,
  budget: number,
): AgentMessage | undefined {
  const clone = structuredClone(message);
  const slots = textSlots(clone);
  const totalChars = slots.reduce((sum, s) => sum + s.get().length, 0);
  if (totalChars === 0) return undefined;
  // Inverse of the chars/4 estimate, shaved 10% for the markers and rounding.
  const targetChars = Math.floor(budget * 4 * 0.9);
  if (targetChars >= totalChars) return undefined; // bulk is not in text
  const scale = targetChars / totalChars;
  for (const s of slots) {
    const text = s.get();
    s.set(elideMiddle(text, Math.floor(text.length * scale)));
  }
  return estimateTokens(clone) <= budget ? clone : undefined;
}
