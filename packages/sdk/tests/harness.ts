/**
 * Contract-test harness: a real {@link HoustonSdk} wired to a real, in-memory
 * {@link startFakeHost} over real HTTP (ephemeral port, so parallel test files
 * never collide).
 *
 * These are NOT unit tests with a mocked `fetch` — they drive the SDK exactly
 * as a host would: `ports.fetch` is `createAuthFetch(globalThis.fetch, storage)`
 * (the documented host wiring, so `session/setToken` really stamps the bearer),
 * a REAL clock (the agents `/v1/events` reconnect loop needs real backoff), and
 * the fake host's `POST /__test__/*` control plane drives the drop / kill /
 * turn-boundary scenarios. The fake host shares the runtime's real streaming
 * pieces (`StreamChannel`, `serveResumableStream`, `formatSseFrame`), so what
 * these tests pin is the wire contract, not a mock's guess.
 */

import {
  type FakeHost,
  SEED_AGENT_ID,
  startFakeHost,
} from "@houston/fake-host";
import {
  type BoardStatus,
  type ConversationVM,
  conversationScope,
  createAuthFetch,
  type FeedOutput,
  HoustonSdk,
  type SdkPorts,
  type SessionStatusValue,
} from "@houston/sdk";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Start a fake host on an ephemeral port (parallel-file safe). */
export function startHost(): Promise<FakeHost> {
  return startFakeHost(0);
}

/** An in-memory {@link KeyValueStore} plus the ports built over it. */
export interface Harness {
  sdk: HoustonSdk;
  /** The token store the auth-fetch and session module share. */
  storage: Map<string, string>;
}

/** Build an SDK pointed at `baseUrl`, wired like a real host. */
export function makeSdk(baseUrl: string): Harness {
  const storage = new Map<string, string>();
  const kv = {
    get: async (k: string) => storage.get(k) ?? null,
    set: async (k: string, v: string) => void storage.set(k, v),
    delete: async (k: string) => void storage.delete(k),
  };
  const baseFetch: typeof fetch = (input, init) => fetch(input, init);
  const ports: SdkPorts = {
    fetch: createAuthFetch(baseFetch, kv),
    storage: kv,
    clock: {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: (id) =>
        clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  return { sdk: new HoustonSdk({ baseUrl, ports }), storage };
}

/** POST a `/__test__/<name>` control route and return its JSON body. */
export async function control(
  baseUrl: string,
  name: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}/__test__/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`control ${name} failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Restore the fake host's seed + clear every chat channel. */
export function resetHost(baseUrl: string): Promise<Record<string, unknown>> {
  return control(baseUrl, "reset");
}

/**
 * Read the conversation VM snapshot for `conversationId`. Scopes are
 * agent-qualified (ADR-0001); every contract suite sends as the fake host's
 * seed agent, so that is the default.
 */
export function convVm(
  sdk: HoustonSdk,
  conversationId: string,
  agentId: string = SEED_AGENT_ID,
): ConversationVM | undefined {
  return sdk.getSnapshot(conversationScope(agentId, conversationId)) as
    | ConversationVM
    | undefined;
}

/** Poll `predicate` on real timers until it holds, or throw after `timeoutMs`. */
export async function until(
  predicate: () => boolean,
  label: string,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for: ${label}`);
    }
    await sleep(10);
  }
}

/** The canned assistant reply the fake host streams for `userText`. */
export function cannedReply(userText: string): string {
  return `Roger that. You said: "${userText}"`;
}

/** A {@link FeedOutput} that records every push — for observer-mode assertions. */
export class RecordingFeedOutput implements FeedOutput {
  readonly feed: { feed_type: string; data: unknown }[] = [];
  readonly statuses: SessionStatusValue[] = [];
  readonly board: BoardStatus[] = [];

  pushFeedItem(_agentPath: string, _sessionKey: string, item: unknown): void {
    this.feed.push(item as { feed_type: string; data: unknown });
  }
  sessionStatus(
    _agentPath: string,
    _sessionKey: string,
    status: SessionStatusValue,
  ): void {
    this.statuses.push(status);
  }
  async persistBoardStatus(
    _agentPath: string,
    _sessionKey: string,
    status: BoardStatus,
  ): Promise<void> {
    this.board.push(status);
  }
}
