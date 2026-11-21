import { getOverflowPatterns } from "@earendil-works/pi-ai";
import {
  estimateTokens,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";

type Preparation = SessionBeforeCompactEvent["preparation"];
export type AgentMessage = Preparation["messagesToSummarize"][number];

export const SUMMARIZER_INPUT_FRACTION = 0.7;

export const SUMMARIZER_INPUT_MAX_TOKENS = 2_000_000;

export function summarizerInputBudget(contextWindow: number): number {
  return Math.min(
    Math.floor(contextWindow * SUMMARIZER_INPUT_FRACTION),
    SUMMARIZER_INPUT_MAX_TOKENS,
  );
}

export function isInputSizeRejection(message: string): boolean {
  if (/rate limit|too many requests|throttl/i.test(message)) return false;
  if (/string too long/i.test(message)) return true;
  return getOverflowPatterns().some((p) => p.test(message));
}

export interface BoundResult {
  kept: AgentMessage[];
  dropped: number;
  elided: number;
}

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

function textSlots(message: AgentMessage): TextSlot[] {
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

export function elideMessage(
  message: AgentMessage,
  budget: number,
): AgentMessage | undefined {
  const clone = structuredClone(message);
  const slots = textSlots(clone);
  const totalChars = slots.reduce((sum, s) => sum + s.get().length, 0);
  if (totalChars === 0) return undefined;
  const targetChars = Math.floor(budget * 4 * 0.9);
  if (targetChars >= totalChars) return undefined;
  const scale = targetChars / totalChars;
  for (const s of slots) {
    const text = s.get();
    s.set(elideMiddle(text, Math.floor(text.length * scale)));
  }
  return estimateTokens(clone) <= budget ? clone : undefined;
}
