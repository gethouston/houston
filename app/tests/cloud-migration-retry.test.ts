import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultShouldRetryResponse,
  sendWithRetry,
} from "../src/lib/cloud-migration-retry.ts";

const ok = { ok: true, status: 200 };
const noSleep = { sleep: async () => {} };

test("a first-try success returns without retrying", async () => {
  let calls = 0;
  const res = await sendWithRetry(async () => {
    calls++;
    return ok;
  }, noSleep);
  assert.equal(res, ok);
  assert.equal(calls, 1);
});

test("a dropped connection (thrown TypeError) is retried to success", async () => {
  let calls = 0;
  const res = await sendWithRetry(async () => {
    calls++;
    if (calls === 1) throw new TypeError("Load failed");
    return ok;
  }, noSleep);
  assert.equal(res, ok);
  assert.equal(calls, 2);
});

test("the gateway's truncated-body 400 is retried until it clears", async () => {
  let calls = 0;
  const res = await sendWithRetry(async () => {
    calls++;
    return calls < 3 ? { ok: false, status: 400 } : ok;
  }, noSleep);
  assert.equal(res, ok);
  assert.equal(calls, 3);
});

test("a non-retryable status returns immediately for the caller to report", async () => {
  let calls = 0;
  const res = await sendWithRetry(async () => {
    calls++;
    return { ok: false, status: 404 };
  }, noSleep);
  assert.equal(res.status, 404);
  assert.equal(calls, 1);
});

test("a budget spent on network errors rethrows the last error", async () => {
  let calls = 0;
  await assert.rejects(
    sendWithRetry(async () => {
      calls++;
      throw new TypeError("Load failed");
    }, noSleep),
    { message: "Load failed" },
  );
  assert.equal(calls, 3);
});

test("a budget spent on retryable responses returns the last response", async () => {
  // The caller's error path then surfaces the server's own detail.
  const res = await sendWithRetry(
    async () => ({ ok: false, status: 502 }),
    noSleep,
  );
  assert.equal(res.status, 502);
});

test("waits ride the backoff schedule, last entry repeating", async () => {
  const waits: number[] = [];
  await sendWithRetry(async () => ({ ok: false, status: 500 }), {
    attempts: 4,
    backoffMs: [10, 20],
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  assert.deepEqual(waits, [10, 20, 20]);
});

test("a hung attempt is aborted by the per-attempt timeout and retried", async () => {
  let calls = 0;
  const res = await sendWithRetry(
    (signal) => {
      calls++;
      if (calls === 1) {
        return new Promise<typeof ok>((_, reject) => {
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
      }
      return Promise.resolve(ok);
    },
    { ...noSleep, timeoutMs: 20 },
  );
  assert.equal(res, ok);
  assert.equal(calls, 2);
});

test("an exhausted run of timeouts reports a named message, not a bare abort", async () => {
  await assert.rejects(
    sendWithRetry(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
      { ...noSleep, attempts: 2, timeoutMs: 10 },
    ),
    { message: "the upload took too long and was stopped" },
  );
});

test("default classification: 5xx and transient statuses retry, semantic errors do not", () => {
  for (const status of [400, 408, 429, 500, 502, 503, 504]) {
    assert.equal(defaultShouldRetryResponse({ ok: false, status }), true);
  }
  for (const status of [401, 403, 404, 409, 413]) {
    assert.equal(defaultShouldRetryResponse({ ok: false, status }), false);
  }
});
