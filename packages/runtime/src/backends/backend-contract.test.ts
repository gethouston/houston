import type { WireEvent } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "./types";

/**
 * The provider-agnostic HarnessBackend contract. Any backend (pi today, another
 * provider's harness tomorrow) must honor these guarantees, so the server and the
 * cloud runtime can drive it blind. Exercised here against a scripted fake so the
 * contract is pinned independent of pi — a real backend that violates it (e.g.
 * throwing from prompt instead of emitting a provider_error, or delivering after
 * unsubscribe) is a contract break, caught by re-running this suite over it.
 */

/** A scripted fake session: `prompt` delivers `script` in order, resolving only
 *  after the terminal event. Provider failures ride the stream, never a throw. */
class FakeSession implements HarnessSession {
  private listeners = new Set<(e: WireEvent) => void>();
  private disposed = false;
  aborts = 0;

  constructor(private readonly script: readonly WireEvent[]) {}

  subscribe(listener: (e: WireEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async prompt(): Promise<void> {
    for (const e of this.script) {
      // Yield between frames so delivery is asynchronous, like a real stream.
      await Promise.resolve();
      for (const l of this.listeners) l(e);
    }
  }
  async abort(): Promise<void> {
    this.aborts++;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<void> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } | undefined {
    return undefined;
  }
}

function fakeBackend(script: readonly WireEvent[]): HarnessBackend {
  return {
    id: "fake",
    async createSession(_opts: CreateSessionOptions): Promise<HarnessSession> {
      return new FakeSession(script);
    },
  };
}

const SCRIPT: readonly WireEvent[] = [
  { type: "text", data: "one " },
  { type: "text", data: "two" },
  {
    type: "usage",
    data: { context_tokens: 10, output_tokens: 2, cached_tokens: 0 },
  },
  { type: "done", data: null },
];

async function open(
  script: readonly WireEvent[] = SCRIPT,
): Promise<HarnessSession> {
  return fakeBackend(script).createSession({
    conversationId: "c1",
    model: { provider: "fake", id: "m1", contextWindow: 1000 },
  });
}

test("events are delivered to the subscriber in order", async () => {
  const session = await open();
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  await session.prompt("go");

  expect(seen).toEqual(SCRIPT);
});

test("unsubscribe stops delivery", async () => {
  const session = await open();
  const seen: WireEvent[] = [];
  const unsub = session.subscribe((e) => seen.push(e));
  unsub();

  await session.prompt("go");

  expect(seen).toEqual([]);
});

test("prompt resolves only after the terminal frame has been delivered", async () => {
  const session = await open();
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  await session.prompt("go");

  // By the time prompt() resolves, the whole script (ending in the terminal
  // `done`) has already been delivered — no frame arrives after settlement.
  expect(seen.at(-1)).toEqual({ type: "done", data: null });
  expect(seen).toHaveLength(SCRIPT.length);
});

test("abort before any prompt is safe (no throw)", async () => {
  const session = await open();
  await expect(session.abort()).resolves.toBeUndefined();
});

test("dispose is idempotent", async () => {
  const session = await open();
  expect(() => {
    session.dispose();
    session.dispose();
  }).not.toThrow();
});
