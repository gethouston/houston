import { expect, test } from "vitest";
import {
  DURABLE_FACTS_FENCE,
  durableFactsInstructions,
  parseDurableFacts,
} from "./durable-facts";

/**
 * The parse is the whole trust boundary of compact-time extraction: a MODEL
 * writes the block, so every shape it can plausibly produce must yield facts or
 * nothing — never an error, never garbage saved as a memory.
 */

const block = (body: string) =>
  `Here is what happened.\n\n\`\`\`${DURABLE_FACTS_FENCE}\n${body}\n\`\`\`\n`;

test("reads one fact per line from the fenced block", () => {
  expect(
    parseDurableFacts(
      block(
        "Ships invoices on the first of the month.\nPrefers short replies.",
      ),
    ),
  ).toEqual([
    "Ships invoices on the first of the month.",
    "Prefers short replies.",
  ]);
});

test("strips list markers and blank lines the model adds", () => {
  expect(
    parseDurableFacts(block("- Runs a bakery.\n\n2. Closes on Mondays.")),
  ).toEqual(["Runs a bakery.", "Closes on Mondays."]);
});

test("a summary with no block yields no facts", () => {
  expect(parseDurableFacts("Just a plain summary of the chat.")).toEqual([]);
  expect(parseDurableFacts(undefined)).toEqual([]);
  expect(parseDurableFacts("")).toEqual([]);
});

test("an empty or placeholder block yields no facts", () => {
  expect(parseDurableFacts(block(""))).toEqual([]);
  expect(parseDurableFacts(block("none"))).toEqual([]);
  expect(parseDurableFacts(block("(None)\n-"))).toEqual([]);
});

test("an unterminated block still yields its facts", () => {
  // Losing real facts to a missing closing fence would be the worse failure.
  expect(
    parseDurableFacts(
      `Summary.\n\n~~~${DURABLE_FACTS_FENCE}\nWorks from Lisbon.`,
    ),
  ).toEqual(["Works from Lisbon."]);
});

test("a differently tagged block is not a facts block", () => {
  expect(parseDurableFacts('```json\n{"a":1}\n```')).toEqual([]);
});

test("the LAST block wins when a model repeats itself", () => {
  const summary = `${block("Older answer.")}\n${block("Final answer.")}`;
  expect(parseDurableFacts(summary)).toEqual(["Final answer."]);
});

test("duplicate lines are collapsed, ignoring case and trailing punctuation", () => {
  expect(
    parseDurableFacts(block("Prefers short replies.\nprefers short replies")),
  ).toEqual(["Prefers short replies."]);
});

test("the fact count and each fact's length are bounded", () => {
  const many = Array.from({ length: 30 }, (_, i) => `Fact number ${i}.`);
  expect(parseDurableFacts(block(many.join("\n")))).toHaveLength(20);
  const [long] = parseDurableFacts(block("x".repeat(900)));
  expect(long?.length).toBe(400);
});

test("only the assistant's conversation carries extraction instructions", async () => {
  const { ASSISTANT_CONVERSATION_ID } = await import(
    "@houston/host/src/routes/assistant"
  );
  expect(durableFactsInstructions(ASSISTANT_CONVERSATION_ID)).toContain(
    DURABLE_FACTS_FENCE,
  );
  expect(durableFactsInstructions("activity-42")).toBeUndefined();
});
