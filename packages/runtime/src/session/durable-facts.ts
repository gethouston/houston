import { ASSISTANT_CONVERSATION_ID } from "@houston/host/src/routes/assistant";

export const DURABLE_FACTS_FENCE = "durable-facts";

const MAX_FACTS = 20;
const MAX_FACT_CHARS = 400;

const PLACEHOLDER_LINES = new Set(["none", "(none)", "n/a", "-", "—", "null"]);

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

const OPENING_FENCE = new RegExp(
  `^(?:\`{3,}|~{3,})\\s*${DURABLE_FACTS_FENCE}\\s*$`,
  "i",
);
const ANY_FENCE = /^(?:`{3,}|~{3,})/;

export const DURABLE_FACTS_INSTRUCTIONS = [
  "You are summarizing a chat between a person and their personal assistant.",
  "After your summary, add one last section: a fenced code block tagged",
  `\`${DURABLE_FACTS_FENCE}\` listing the DURABLE facts about this person that`,
  "the summarized conversation revealed - stable preferences, standing context",
  "about their life or work, decisions and commitments that will still be true",
  "weeks from now.",
  "Write one fact per line, each a complete plain sentence that stands on its own",
  "without this conversation.",
  "Leave out anything momentary: today's request, the state of a task in flight,",
  "or anything you are only guessing at.",
  "If the conversation revealed no such facts, leave the block empty.",
].join(" ");

export function durableFactsInstructions(
  conversationId: string,
): string | undefined {
  return isAssistantConversation(conversationId)
    ? DURABLE_FACTS_INSTRUCTIONS
    : undefined;
}

export function isAssistantConversation(conversationId: string): boolean {
  return conversationId === ASSISTANT_CONVERSATION_ID;
}

export function parseDurableFacts(summary: string | undefined): string[] {
  if (!summary) return [];
  const lines = summary.split(/\r?\n/);
  let open: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (OPENING_FENCE.test((lines[i] ?? "").trim())) open = i;
  }
  if (open === null) return [];

  const seen = new Set<string>();
  const facts: string[] = [];
  for (let i = open + 1; i < lines.length && facts.length < MAX_FACTS; i++) {
    const raw = (lines[i] ?? "").trim();
    if (ANY_FENCE.test(raw)) break;
    const text = raw.replace(LIST_MARKER, "").trim();
    if (!text || PLACEHOLDER_LINES.has(text.toLowerCase())) continue;
    const fact = text.slice(0, MAX_FACT_CHARS);
    const key = normalizeFact(fact);
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
  }
  return facts;
}

export function normalizeFact(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,;:-]+|[\s"'.,;:-]+$/g, "");
}
