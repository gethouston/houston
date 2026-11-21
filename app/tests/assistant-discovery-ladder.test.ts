import assert from "node:assert";
import { describe, it } from "node:test";
import { runDiscoveryLadder } from "../src/lib/assistant-discovery-ladder.ts";

const WAKING = { status: 503, body: { error: "engine unavailable" } };
const ABSENT = { status: 501, body: { code: "assistant_gateway_only" } };
const HANDLE = { agent: "a551", conversation: "assistant" };

function counted<T>(answer: () => Promise<T>) {
  let asks = 0;
  return {
    ask: () => {
      asks += 1;
      return answer();
    },
    asks: () => asks,
  };
}

describe("runDiscoveryLadder", () => {
  it("answers with the address", async () => {
    const asker = counted(async () => HANDLE);
    const reported: unknown[] = [];

    const got = await runDiscoveryLadder({
      ask: asker.ask,
      surface: async (e) => {
        reported.push(e);
      },
    });

    assert.deepStrictEqual(got, HANDLE);
    assert.strictEqual(asker.asks(), 1);
    assert.deepStrictEqual(reported, []);
  });

  it("reports a final failure once and rethrows it", async () => {
    const asker = counted(() => Promise.reject(ABSENT));
    const reported: unknown[] = [];

    await assert.rejects(
      runDiscoveryLadder({
        ask: asker.ask,
        surface: async (e) => {
          reported.push(e);
        },
      }),
      (e) => e === ABSENT,
    );
    assert.strictEqual(asker.asks(), 1);
    assert.deepStrictEqual(reported, [ABSENT]);
  });

  it("stops during the backoff when cancelled, asking nothing more", async () => {
    const asker = counted(() => Promise.reject(WAKING));
    const reported: unknown[] = [];
    const cancel = new AbortController();

    const run = runDiscoveryLadder({
      ask: asker.ask,
      surface: async (e) => {
        reported.push(e);
      },
      signal: cancel.signal,
    });
    await new Promise((r) => setTimeout(r, 10));
    cancel.abort();

    await assert.rejects(run);
    assert.strictEqual(asker.asks(), 1);
    assert.deepStrictEqual(reported, []);
  });

  it("drops an answer that fails after it was cancelled, unreported", async () => {
    const cancel = new AbortController();
    const asker = counted(() => {
      cancel.abort();
      return Promise.reject(WAKING);
    });
    const reported: unknown[] = [];

    await assert.rejects(
      runDiscoveryLadder({
        ask: asker.ask,
        surface: async (e) => {
          reported.push(e);
        },
        signal: cancel.signal,
      }),
    );
    assert.strictEqual(asker.asks(), 1);
    assert.deepStrictEqual(reported, []);
  });

  it("never starts when already cancelled", async () => {
    const asker = counted(async () => HANDLE);
    const cancel = new AbortController();
    cancel.abort();

    await assert.rejects(
      runDiscoveryLadder({
        ask: asker.ask,
        surface: async () => {},
        signal: cancel.signal,
      }),
    );
    assert.strictEqual(asker.asks(), 0);
  });
});
