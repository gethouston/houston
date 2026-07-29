import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { renderReplayPreamble, replayCharBudget } from "./replay-transcript";

const msg = (
  role: "user" | "assistant",
  content: string,
  extra?: Partial<ChatMessage>,
): ChatMessage => ({ role, content, ts: 0, ...extra });

test("renders prior turns and excludes the current turn's user message", () => {
  const p = renderReplayPreamble(
    [
      msg("user", "translate hello to French", { turnId: "t1" }),
      msg("assistant", "Bonjour — hello in French is «bonjour».", {
        turnId: "t1",
      }),
      msg("user", "and to Spanish?", { turnId: "t2" }),
    ],
    "t2",
    100_000,
  );
  expect(p).not.toBeNull();
  expect(p?.text).toContain("User: translate hello to French");
  expect(p?.text).toContain("Assistant: Bonjour");
  // The current turn's message is delivered as the actual prompt — never doubled.
  expect(p?.text).not.toContain("and to Spanish?");
  expect(p?.truncated).toBe(false);
});

test("returns null for a conversation with nothing to carry", () => {
  expect(renderReplayPreamble([], "t1", 100_000)).toBeNull();
  // Only THIS turn's message on disk (a brand-new conversation's first turn).
  expect(
    renderReplayPreamble([msg("user", "hi", { turnId: "t1" })], "t1", 100_000),
  ).toBeNull();
});

test("skips empty messages (stop markers) and renders tool-only turns as actions", () => {
  const p = renderReplayPreamble(
    [
      msg("user", "check my calendar", { turnId: "t1" }),
      msg("assistant", "", { turnId: "t1", stopped: true }),
      msg("assistant", "", {
        turnId: "t1",
        tools: [{ name: "integration_execute", input: {} }],
      }),
    ],
    "t2",
    100_000,
  );
  expect(p?.text).toContain("[performed actions: integration_execute]");
  expect(p?.text).not.toMatch(/Assistant: *\n/);
});

test("attributes multiplayer authors on user messages", () => {
  const p = renderReplayPreamble(
    [msg("user", "ship it", { author: { userId: "u1", name: "Dana" } })],
    "t9",
    100_000,
  );
  expect(p?.text).toContain("User (Dana): ship it");
});

test("keeps the newest messages when the transcript exceeds the budget", () => {
  const p = renderReplayPreamble(
    [
      msg("user", `old ${"x".repeat(300)}`),
      msg("assistant", "middle reply"),
      msg("user", "newest question"),
    ],
    "t9",
    120,
  );
  expect(p?.truncated).toBe(true);
  expect(p?.text).toContain("newest question");
  expect(p?.text).toContain("middle reply");
  expect(p?.text).not.toContain("old x");
  expect(p?.text).toContain("omitted");
});

test("hard-clips a single over-budget message instead of dropping everything", () => {
  const p = renderReplayPreamble(
    [msg("user", `${"a".repeat(500)}TAIL`)],
    "t9",
    100,
  );
  expect(p?.truncated).toBe(true);
  expect(p?.text).toContain("TAIL");
});

test("replayCharBudget applies the fit fraction at ~4 chars/token", () => {
  expect(replayCharBudget(200_000)).toBe(640_000);
  expect(replayCharBudget(0)).toBe(0);
});
