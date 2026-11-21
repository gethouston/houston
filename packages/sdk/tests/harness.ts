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
  type SdkLogger,
  type SdkPorts,
  type SessionStatusValue,
} from "@houston/sdk";
import { memoryKv } from "../src/test-ports";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function startHost(): Promise<FakeHost> {
  return startFakeHost(0);
}

export interface Harness {
  sdk: HoustonSdk;
  storage: Map<string, string>;
}

export function makeSdk(baseUrl: string, logger?: SdkLogger): Harness {
  const storage = new Map<string, string>();
  const kv = memoryKv(storage);
  const baseFetch: typeof fetch = (input, init) => fetch(input, init);
  const ports: SdkPorts = {
    fetch: createAuthFetch(baseFetch, kv),
    storage: kv,
    devicePreferences: memoryKv(),
    clock: {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: (id) =>
        clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    },
    logger: logger ?? {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  return { sdk: new HoustonSdk({ baseUrl, ports }), storage };
}

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

export function resetHost(baseUrl: string): Promise<Record<string, unknown>> {
  return control(baseUrl, "reset");
}

export function convVm(
  sdk: HoustonSdk,
  conversationId: string,
  agentId: string = SEED_AGENT_ID,
): ConversationVM | undefined {
  return sdk.getSnapshot(conversationScope(agentId, conversationId)) as
    | ConversationVM
    | undefined;
}

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

export async function untilAsync(
  predicate: () => Promise<boolean>,
  label: string,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for: ${label}`);
    }
    await sleep(10);
  }
}

export function cannedReply(userText: string): string {
  return `Roger that. You said: "${userText}"`;
}

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
