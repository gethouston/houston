import { ok, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient, isHoustonEngineError } from "../src/client.ts";

/**
 * Transport retry/backoff — the fix for HOU-432 (engine sidecar drops →
 * frontend fetches to 127.0.0.1 fail with WebKit "Load failed").
 *
 * A fake `fetchImpl` is injected so we can simulate transient transport
 * failures deterministically, and `retry` is tuned to ~0ms delays so the
 * suite runs instantly.
 *
 * Core policy under test: a thrown `TypeError` cannot tell "never delivered"
 * from "ran, response lost", so retry is gated on REPLAY-SAFETY — idempotent
 * methods and curated read-only POSTs retry; mutating POSTs do NOT.
 */

const FAST = { baseDelayMs: 1, maxDelayMs: 1, deadlineMs: 5_000 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** WebKit/Chromium/undici all report a transport failure as a `TypeError`. */
function loadFailed(): never {
  throw new TypeError("Load failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("HoustonClient transport retry (HOU-432)", () => {
  it("succeeds on the first try with exactly one fetch", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ ok: true });
      },
    });
    await client.health();
    strictEqual(calls, 1);
  });

  it("retries a 'Load failed' TypeError on an idempotent GET, then succeeds", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) loadFailed();
        return jsonResponse({ ok: true });
      },
    });
    await client.health();
    strictEqual(calls, 3);
  });

  it("gives up after maxAttempts and surfaces the network error", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 3 },
      fetchImpl: async () => {
        calls += 1;
        loadFailed();
      },
    });
    await rejects(client.health(), (err: unknown) => err instanceof TypeError);
    strictEqual(calls, 3);
  });

  it("stops on the wall-clock deadline before exhausting maxAttempts", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      // A generous attempt cap but a tiny deadline: the clock must stop it.
      retry: {
        baseDelayMs: 1,
        maxDelayMs: 1,
        deadlineMs: 30,
        maxAttempts: 1000,
      },
      fetchImpl: async () => {
        calls += 1;
        await sleep(10);
        loadFailed();
      },
    });
    await rejects(client.health(), (err: unknown) => err instanceof TypeError);
    ok(calls >= 2, `retried at least once (calls=${calls})`);
    ok(calls < 1000, `stopped well before maxAttempts (calls=${calls})`);
  });

  it("never retries an HTTP 4xx (the request was processed)", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ error: { code: "nope", message: "bad" } }, 404);
      },
    });
    await rejects(client.health(), (err: unknown) => isHoustonEngineError(err));
    strictEqual(calls, 1);
  });

  it("retries a 503 on a GET (idempotent), then succeeds", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        if (calls < 2) return new Response("", { status: 503 });
        return jsonResponse({ ok: true });
      },
    });
    await client.health(); // GET /health
    strictEqual(calls, 2);
  });

  it("retries a 503 on a PUT (idempotent), then succeeds", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        if (calls < 2) return new Response("", { status: 503 });
        return jsonResponse({});
      },
    });
    await client.setPreference("k", "v"); // PUT /preferences/k
    strictEqual(calls, 2);
  });

  it("does NOT retry a 503 on a mutating POST", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        return new Response("", { status: 503 });
      },
    });
    await rejects(client.createWorkspace({ name: "w" }), (err: unknown) =>
      isHoustonEngineError(err),
    );
    strictEqual(calls, 1);
  });

  it("does NOT retry a network TypeError on a mutating POST (could double-execute)", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        loadFailed();
      },
    });
    // createWorkspace is a POST → NOT replay-safe; a lost response could mean
    // the workspace was already created, so we must not silently re-POST.
    await rejects(
      client.createWorkspace({ name: "w" }),
      (err: unknown) => err instanceof TypeError,
    );
    strictEqual(calls, 1);
  });

  it("DOES retry a network TypeError on a read-only POST (the HOU-432 culprit)", async () => {
    let calls = 0;
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        if (calls < 2) loadFailed();
        return jsonResponse({ content: "file body" });
      },
    });
    // readAgentFile is a POST that the client marks replay-safe.
    const content = await client.readAgentFile("/agent", "data.json");
    strictEqual(content, "file body");
    strictEqual(calls, 2);
  });

  it("recovers across an endpoint swap mid-retry (engine restarted on a new port)", async () => {
    const OLD = "http://127.0.0.1:57461";
    const NEW = "http://127.0.0.1:62000";
    const urls: string[] = [];
    let client: HoustonClient;
    client = new HoustonClient({
      baseUrl: OLD,
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.startsWith(OLD)) {
          // Simulate the supervisor handing us a fresh port, then the old
          // port refusing the connection.
          client.setEndpoint({ baseUrl: NEW, token: "t2" });
          loadFailed();
        }
        return jsonResponse({ ok: true });
      },
    });
    await client.health();
    strictEqual(urls.length, 2);
    ok(urls[0].startsWith(OLD), `first attempt hit old port: ${urls[0]}`);
    ok(urls[1].startsWith(NEW), `retry hit new port: ${urls[1]}`);
  });

  it("propagates an AbortError without issuing a request when pre-aborted", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse([]);
      },
    });
    // searchCommunitySkills threads the AbortSignal through to send().
    await rejects(
      client.searchCommunitySkills("q", controller.signal),
      (err: unknown) => err instanceof Error && err.name === "AbortError",
    );
    strictEqual(calls, 0);
  });

  it("normalizes an abort during backoff to an AbortError and stops retrying", async () => {
    let calls = 0;
    const controller = new AbortController();
    const client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "t",
      // Backoff long enough that we can abort mid-wait.
      retry: {
        baseDelayMs: 100,
        maxDelayMs: 100,
        deadlineMs: 5_000,
        maxAttempts: 5,
      },
      fetchImpl: async () => {
        calls += 1;
        // Abort while the first backoff is pending, then fail the request.
        if (calls === 1) setTimeout(() => controller.abort(), 5);
        loadFailed();
      },
    });
    await rejects(
      client.searchCommunitySkills("q", controller.signal),
      (err: unknown) => err instanceof Error && err.name === "AbortError",
    );
    strictEqual(calls, 1);
  });

  it("sends the bearer token from the CURRENT endpoint on each retry", async () => {
    const tokens: (string | null)[] = [];
    let client: HoustonClient;
    let calls = 0;
    client = new HoustonClient({
      baseUrl: "http://127.0.0.1:1111",
      token: "old-token",
      retry: { ...FAST, maxAttempts: 5 },
      fetchImpl: async (_input, init) => {
        calls += 1;
        const auth = new Headers(init?.headers).get("authorization");
        tokens.push(auth);
        if (calls < 2) {
          client.setEndpoint({
            baseUrl: "http://127.0.0.1:1111",
            token: "new-token",
          });
          loadFailed();
        }
        return jsonResponse({ ok: true });
      },
    });
    await client.health();
    strictEqual(tokens[0], "Bearer old-token");
    strictEqual(tokens[1], "Bearer new-token");
  });
});
