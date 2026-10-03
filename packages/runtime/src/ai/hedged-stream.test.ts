import {
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
  fauxAssistantMessage,
} from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { hedgedStream } from "./hedged-stream";

/**
 * The hedge's race, on scripted attempts and fake timers: who wins, who is
 * cancelled, when another attempt goes out, and what the caller sees.
 */

afterEach(() => {
  vi.useRealTimers();
});

interface Attempt {
  stream: AssistantMessageEventStream;
  signal: AbortSignal;
  answer(text: string): void;
  fail(message: string): void;
}

/** Opens attempts that say nothing until told to; an abort ends one as pi does. */
function provider() {
  const attempts: Attempt[] = [];
  const open = (signal: AbortSignal) => {
    const stream = createAssistantMessageEventStream();
    const message = (over: Partial<AssistantMessage>) => ({
      ...fauxAssistantMessage(""),
      ...over,
    });
    signal.addEventListener("abort", () => {
      const aborted = message({ stopReason: "aborted" });
      stream.push({ type: "error", reason: "aborted", error: aborted });
      stream.end(aborted);
    });
    attempts.push({
      stream,
      signal,
      answer(text) {
        const done = fauxAssistantMessage(text);
        stream.push({ type: "start", partial: message({}) });
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: text,
          partial: done,
        });
        stream.push({ type: "done", reason: "stop", message: done });
        stream.end(done);
      },
      fail(errorMessage) {
        const failed = message({ stopReason: "error", errorMessage });
        stream.push({ type: "error", reason: "error", error: failed });
        stream.end(failed);
      },
    });
    return stream;
  };
  return { attempts, open };
}

async function drain(stream: AssistantMessageEventStream) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const texts = (events: AssistantMessageEvent[]) =>
  events.flatMap((e) => (e.type === "text_delta" ? [e.delta] : []));

test("a silent first attempt is hedged at the deadline and the hedge's answer wins", async () => {
  vi.useFakeTimers();
  const { attempts, open } = provider();
  const onAttempt = vi.fn();
  const onAnswered = vi.fn();
  const out = drain(
    hedgedStream(open, {
      deadlineMs: 1000,
      extraAttempts: 2,
      onAttempt,
      onAnswered,
    }),
  );
  await vi.advanceTimersByTimeAsync(999);
  expect(attempts).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(attempts).toHaveLength(2);
  expect(onAttempt).toHaveBeenCalledWith(2, 1000);
  // The first still waits: a hedge never cancels what it races.
  expect(attempts[0]?.signal.aborted).toBe(false);

  attempts[1]?.answer("from the hedge");
  const events = await out;
  expect(texts(events)).toEqual(["from the hedge"]);
  expect(events.at(-1)?.type).toBe("done");
  expect(attempts[0]?.signal.aborted).toBe(true);
  expect(onAnswered).toHaveBeenCalledWith(2, 1000);
  // Answered: no third attempt, ever.
  await vi.advanceTimersByTimeAsync(10_000);
  expect(attempts).toHaveLength(2);
});

test("the first attempt answering after the hedge went out still wins", async () => {
  vi.useFakeTimers();
  const { attempts, open } = provider();
  const out = drain(hedgedStream(open, { deadlineMs: 1000, extraAttempts: 2 }));
  await vi.advanceTimersByTimeAsync(1500);
  attempts[0]?.answer("late but first");
  expect(texts(await out)).toEqual(["late but first"]);
  expect(attempts[1]?.signal.aborted).toBe(true);
});

test("an answer before the deadline sends nothing more", async () => {
  vi.useFakeTimers();
  const { attempts, open } = provider();
  const out = drain(hedgedStream(open, { deadlineMs: 1000, extraAttempts: 2 }));
  attempts[0]?.answer("on time");
  expect(texts(await out)).toEqual(["on time"]);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(attempts).toHaveLength(1);
});

test("at most two extra attempts; the caller's cancel ends them all with one terminal", async () => {
  vi.useFakeTimers();
  const { attempts, open } = provider();
  const caller = new AbortController();
  const out = drain(
    hedgedStream(open, {
      deadlineMs: 1000,
      extraAttempts: 2,
      signal: caller.signal,
    }),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(attempts).toHaveLength(3);
  caller.abort();
  const events = await out;
  expect(events.map((e) => e.type)).toEqual(["error"]);
  expect(attempts.every((a) => a.signal.aborted)).toBe(true);
});

test("a failure with nothing else in flight is the answer, and no hedge follows it", async () => {
  vi.useFakeTimers();
  const { attempts, open } = provider();
  const out = drain(hedgedStream(open, { deadlineMs: 1000, extraAttempts: 2 }));
  attempts[0]?.fail("429 Too Many Requests");
  const events = await out;
  expect(events.map((e) => e.type)).toEqual(["error"]);
  await vi.advanceTimersByTimeAsync(10_000);
  // pi's own retry, with its backoff, handles a 429: never a hedge.
  expect(attempts).toHaveLength(1);
});

test("a failing hedge yields to the attempt still waiting, whose answer wins", async () => {
  vi.useFakeTimers();
  const { attempts, open } = provider();
  const out = drain(hedgedStream(open, { deadlineMs: 1000, extraAttempts: 2 }));
  await vi.advanceTimersByTimeAsync(1000);
  attempts[1]?.fail("502 Bad Gateway");
  attempts[0]?.answer("the first one");
  expect(texts(await out)).toEqual(["the first one"]);
});

test("when every attempt fails, the last failure is the answer", async () => {
  vi.useFakeTimers();
  const { attempts, open } = provider();
  const out = drain(hedgedStream(open, { deadlineMs: 1000, extraAttempts: 1 }));
  await vi.advanceTimersByTimeAsync(1000);
  attempts[0]?.fail("first failure");
  attempts[1]?.fail("second failure");
  const events = await out;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "error",
    error: { errorMessage: "second failure" },
  });
});

test("a first attempt that throws leaves nothing scheduled behind it", async () => {
  vi.useFakeTimers();
  let opens = 0;
  expect(() =>
    hedgedStream(
      () => {
        opens++;
        throw new Error("no such model");
      },
      { deadlineMs: 1000, extraAttempts: 2 },
    ),
  ).toThrow("no such model");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(opens).toBe(1);
});
