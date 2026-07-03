import type {
  EventStreamOptions,
  HoustonEngineClient,
} from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import type { HoustonClient } from "../src/engine-adapter/client";
import { disposeAllStreams } from "../src/engine-adapter/stream-registry";
import { observeConversation } from "../src/engine-adapter/turn-stream";
import { EngineWebSocket } from "../src/engine-adapter/ws";

/**
 * EngineWebSocket.disconnect() is the adapter's client-teardown seam (logout /
 * mode change): live conversation streams must not outlive the client. The
 * dispose is deferred one tick so the token-rotation bounce — disconnect()
 * immediately followed by connect() in setHostedEngineSessionToken — keeps a
 * live turn's rendering alive.
 */

const fakeClient = {
  subscribeServerEvents: () => () => {},
} as unknown as HoustonClient;

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function hangingObserver(sessionKey: string) {
  let aborted = false;
  const engine = {
    async streamEvents(_id: string, opts: EventStreamOptions) {
      opts.onEvent({
        type: "sync",
        data: { running: true, partial: "", seq: 1 },
        seq: 1,
      });
      return new Promise<void>((resolve) => {
        opts.signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        );
      });
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  observeConversation(engine, "Houston/Bo", sessionKey, async () => {}, 0, {
    idleTimeoutMs: 5_000,
    backoff: { initialMs: 1, maxMs: 2, jitter: () => 0 },
  });
  return { isAborted: () => aborted };
}

afterEach(() => disposeAllStreams());

test("disconnect() disposes live conversation streams a tick later", async () => {
  const observer = hangingObserver("activity-ws-teardown");
  const ws = new EngineWebSocket(fakeClient);
  ws.connect();
  await tick();
  expect(observer.isAborted()).toBe(false);

  ws.disconnect();
  await tick();
  expect(observer.isAborted()).toBe(true);
});

test("a disconnect()+connect() bounce (token rotation) keeps the streams alive", async () => {
  const observer = hangingObserver("activity-ws-rotation");
  const ws = new EngineWebSocket(fakeClient);
  ws.connect();
  await tick();

  ws.disconnect();
  ws.connect(); // same tick — the rotation path in setHostedEngineSessionToken
  await tick();
  expect(observer.isAborted()).toBe(false);

  ws.disconnect(); // real teardown
  await tick();
  expect(observer.isAborted()).toBe(true);
});
