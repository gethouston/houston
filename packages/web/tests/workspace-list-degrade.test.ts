import { afterEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";
import {
  isTransientHostError,
  retryTransientRead,
} from "../src/engine-adapter/cp/retry";

/**
 * HOU-981, the "wrong space all session" half.
 *
 * `listWorkspaces` used to end in `catch { return [personal] }`. One transient
 * `GET /v1/workspaces` failure therefore dropped every `org:*` team space
 * SILENTLY: `resolveActiveWorkspace` fell back to personal, and a Teams user
 * spent the whole session in the wrong space with all their missions
 * apparently gone — no toast, no retry, nothing to report.
 *
 * The posture now: retry transient failures, degrade on a 404 (a host that
 * predates the surface genuinely has no team spaces), and THROW on anything
 * else so the workspace store lands in its visible `loadError` state (with the
 * `call()` toast) and the persisted `last_workspace_id` survives for the next
 * successful load.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Route `/v1/workspaces` through a queue of responses; every OTHER request
 * (the provider probe `listWorkspaces` makes to label the synthetic personal
 * row) fails harmlessly, which the adapter already treats as "use defaults".
 */
function stubWorkspaceReads(...responses: Response[]) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (!url.endsWith("/v1/workspaces")) throw new TypeError("not stubbed");
    calls.push(url);
    const next = responses.shift();
    if (!next) throw new Error("stubWorkspaceReads: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

const CFG = { baseUrl: "https://gateway.example", token: "t" };
const client = () => new HoustonClient({ ...CFG, controlPlane: true });

const TEAM = {
  id: "org:00112233aabbccdd",
  name: "Acme",
  isDefault: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

test("bridges the org rows in on a healthy read", async () => {
  stubWorkspaceReads(json(200, [{ id: "ws_served" }, TEAM]));

  const spaces = await client().listWorkspaces();

  expect(spaces.map((w) => w.id)).toEqual(["default", TEAM.id]);
});

test("a transient failure is retried, not silently downgraded to personal", async () => {
  const calls = stubWorkspaceReads(
    json(500, { error: "gateway rolling" }),
    json(200, [TEAM]),
  );

  const spaces = await client().listWorkspaces();

  expect(calls).toHaveLength(2);
  expect(spaces.map((w) => w.id)).toEqual(["default", TEAM.id]);
});

test("a 404 degrades to personal — that host serves no team spaces", async () => {
  stubWorkspaceReads(json(404, { error: "not found" }));

  const spaces = await client().listWorkspaces();

  expect(spaces.map((w) => w.id)).toEqual(["default"]);
});

test("a persistent failure THROWS instead of pretending the teams are gone", async () => {
  stubWorkspaceReads(json(403, { error: "forbidden" }));

  await expect(client().listWorkspaces()).rejects.toThrow(HoustonEngineError);
});

test("isTransientHostError retries 5xx and network drops only", () => {
  expect(isTransientHostError(new HoustonEngineError(503, {}))).toBe(true);
  expect(isTransientHostError({ status: 500 })).toBe(true);
  expect(isTransientHostError(new TypeError("Load failed"))).toBe(true);
  expect(isTransientHostError(new HoustonEngineError(404, {}))).toBe(false);
  expect(isTransientHostError(new HoustonEngineError(401, {}))).toBe(false);
  expect(isTransientHostError(new Error("boom"))).toBe(false);
});

test("retryTransientRead is bounded and rethrows the last failure verbatim", async () => {
  let attempts = 0;
  const read = async () => {
    attempts += 1;
    throw new HoustonEngineError(503, { error: "still rolling" });
  };

  await expect(retryTransientRead(read, [0, 0])).rejects.toThrow(
    "still rolling (engine error 503)",
  );
  expect(attempts).toBe(3); // the first try plus one per delay
});

test("retryTransientRead never retries a terminal failure", async () => {
  let attempts = 0;
  const read = async () => {
    attempts += 1;
    throw new HoustonEngineError(401, { error: "expired" });
  };

  await expect(retryTransientRead(read, [0, 0])).rejects.toThrow(
    "expired (engine error 401)",
  );
  expect(attempts).toBe(1);
});
