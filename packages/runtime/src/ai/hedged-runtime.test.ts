import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import {
  DEADLINE_MS,
  hedgedSession,
  neverAnswers,
} from "./hedged-session.test-support";

/**
 * The hedge end to end: a REAL pi AgentSession, built the way the pi backend
 * builds one (backends/pi/backend.ts wraps its model runtime the same way),
 * over the scripted faux provider. The provider's first request never
 * answers, the way 47 did on staging (RL2, 2026-10-03); its second answers.
 */

const text = (events: WireEvent[]) =>
  events
    .filter((e): e is Extract<WireEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.data)
    .join("");
const cards = (events: WireEvent[]) =>
  events.filter((e) => e.type === "provider_error");

afterEach(() => {
  vi.restoreAllMocks();
});

test("a request the provider never answers is sent again and the turn ends clean", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { faux, session, events, answered } = await hedgedSession([
    neverAnswers,
    fauxAssistantMessage("Answered on the second try"),
  ]);
  const started = performance.now();
  await session.prompt("hello");
  const tookMs = performance.now() - started;

  expect(text(events)).toBe("Answered on the second try");
  // No card, no retry message: the person sees an answer one deadline late.
  expect(cards(events)).toEqual([]);
  expect(faux.state.callCount).toBe(2);
  expect(answered[0]).toBeGreaterThanOrEqual(DEADLINE_MS);
  expect(tookMs).toBeLessThan(DEADLINE_MS + 1000);
  // One line per duplicate request: the count of hedges, and of the input
  // tokens they cost.
  const hedgeLines = warn.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith("[provider_hedge]"));
  expect(hedgeLines).toEqual([
    expect.stringContaining("provider=faux model=faux-1 attempt=2 sent"),
    expect.stringContaining("answered by attempt=2"),
  ]);
});

test("a provider that answers in time is sent one request", async () => {
  const { faux, session, events } = await hedgedSession([
    fauxAssistantMessage("Right away"),
  ]);
  await session.prompt("hello");
  expect(text(events)).toBe("Right away");
  expect(faux.state.callCount).toBe(1);
});

test("a deadline of 0 (a custom endpoint) never hedges, however slow, and still reports its first byte", async () => {
  const slow = async () => {
    await new Promise((r) => setTimeout(r, DEADLINE_MS * 3));
    return fauxAssistantMessage("Slow local model");
  };
  const { faux, session, events, answered } = await hedgedSession([slow], 0);
  await session.prompt("hello");
  expect(text(events)).toBe("Slow local model");
  expect(faux.state.callCount).toBe(1);
  expect(answered).toHaveLength(1);
});

test("a request pi retries itself at the provider level is never hedged", async () => {
  const slow = async () => {
    await new Promise((r) => setTimeout(r, DEADLINE_MS * 3));
    return fauxAssistantMessage("After a provider-level retry");
  };
  const { faux, session, events } = await hedgedSession([slow], DEADLINE_MS, {
    retry: { baseDelayMs: 0, provider: { maxRetries: 2 } },
  });
  await session.prompt("hello");
  expect(text(events)).toBe("After a provider-level retry");
  expect(faux.state.callCount).toBe(1);
});
