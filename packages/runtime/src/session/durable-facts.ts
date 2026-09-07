import { ASSISTANT_CONVERSATION_ID } from "@houston/host/src/routes/assistant";

/**
 * DURABLE FACTS AT COMPACT TIME (the assistant's memory).
 *
 * The personal assistant lives in ONE conversation that never ends, so
 * autocompact is the moment its oldest turns stop being visible to the model.
 * Whatever the user revealed there — how they work, what they always want, what
 * they decided — would be lost with them. So the assistant's compaction asks the
 * summarizer for one extra thing: a delimited list of the DURABLE facts the
 * summarized stretch revealed, which the harvest then saves as memories
 * (durable-facts-harvest.ts).
 *
 * This module is the PURE half: the instructions we send, and the tolerant parse
 * of what comes back. Tolerant is the whole posture — the block is produced by a
 * model, so an absent, empty, or malformed one yields no facts and never an
 * error. Only the assistant's own conversation is treated this way; every other
 * conversation compacts exactly as it always has.
 */

/** The info string of the fenced block the summarizer is asked to end with. */
export const DURABLE_FACTS_FENCE = "durable-facts";

/** Bounds on what one compaction may contribute, before anything is written. */
const MAX_FACTS = 20;
const MAX_FACT_CHARS = 400;

/** Lines a model writes when it has nothing to report; never saved as facts. */
const PLACEHOLDER_LINES = new Set(["none", "(none)", "n/a", "-", "—", "null"]);

/** Leading list markers ("- ", "* ", "• ", "1. ") a model tends to add. */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** A fence opening the facts block, e.g. ```durable-facts or ~~~durable-facts */
const OPENING_FENCE = new RegExp(
  `^(?:\`{3,}|~{3,})\\s*${DURABLE_FACTS_FENCE}\\s*$`,
  "i",
);
const ANY_FENCE = /^(?:`{3,}|~{3,})/;

/**
 * What the assistant's compaction asks the summarizer to append. Phrased for the
 * summarizing model, not the user: it must produce facts that still make sense
 * months later with none of this conversation's context, because that is exactly
 * how they will be read back — one line each, inside the fenced block the parse
 * below looks for.
 */
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

/**
 * The instructions for THIS conversation's compaction: the fact request for the
 * assistant, nothing at all for every other conversation (whose summaries stay
 * byte-identical to today's).
 */
export function durableFactsInstructions(
  conversationId: string,
): string | undefined {
  return isAssistantConversation(conversationId)
    ? DURABLE_FACTS_INSTRUCTIONS
    : undefined;
}

/** Whether this conversation is the user's personal assistant thread. */
export function isAssistantConversation(conversationId: string): boolean {
  return conversationId === ASSISTANT_CONVERSATION_ID;
}

/**
 * The facts a compaction summary carries, or [] when it carries none.
 *
 * Reads the LAST `durable-facts` block in the summary (the instructions ask for
 * one, at the end; a model that repeats itself then contributes its final
 * answer rather than both). An unterminated block still yields its lines —
 * losing real facts to a missing closing fence would be the worse failure.
 */
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

/**
 * The comparison form of a fact: what "we already remember this" means. Case and
 * surrounding punctuation/whitespace are noise — a summarizer that re-emits the
 * same fact with a trailing period on the next compaction must not double it.
 */
export function normalizeFact(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,;:-]+|[\s"'.,;:-]+$/g, "");
}
