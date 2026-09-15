import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { createWireCapture, json, ORG } from "./support/wire-capture";

/**
 * The ROUTINES family delegated to `@houston/sdk`: the definitions, the run
 * history, firing and stopping a run, and the incoming-webhook key.
 *
 * These assertions ARE the record of what those calls put on the wire: same
 * method, whole URL, body bytes,
 * and headers (`Content-Type`, the `Authorization` bearer, the live
 * `x-houston-org`) over the ONE shared gateway fetch. The routines module
 * publishes no scope and never refetches after a write, so each call is exactly
 * one request — the adapter's own `RoutinesChanged` echo stays the only
 * invalidation.
 *
 * Two dispositions are pinned because getting either wrong is silent: the mint
 * goes to the GATEWAY control route (`/v1/agents/…`, never the agent proxy) and
 * is the ONLY operation here that degrades — its 404 reads as "webhook keys
 * unsupported", every other failure and every other operation throws.
 */

const BASE = "http://host";

const { calls, reset, restore, stubResponses: stubFetch } = createWireCapture();

beforeEach(() => {
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

const routine = {
  id: "r1",
  name: "Daily digest",
  prompt: "Summarize the inbox",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared" as const,
  integrations: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const run = {
  id: "run1",
  routine_id: "r1",
  status: "running" as const,
  session_key: "sk-1",
  started_at: "2026-01-01T09:00:00.000Z",
};

// ---- listRoutines / listRoutineRuns ----

test("listRoutines delegates a byte-identical single GET /agents/:id/routines", async () => {
  stubFetch(json(200, { items: [routine] }));

  const rows = await client().listRoutines("a1");

  expect(calls).toHaveLength(1); // the read publishes no scope: one request
  const [get] = calls;
  expect(get.method).toBe("GET");
  expect(get.url).toBe(`${BASE}/agents/a1/routines`);
  expect(get.body).toBeNull();
  expect(get.headers.get("Content-Type")).toBe("application/json");
  expect(get.headers.get("Authorization")).toBe("Bearer t");
  // The `{ items }` envelope is unwrapped exactly as the cp copy unwrapped it.
  expect(rows).toEqual([routine]);
});

test("listRoutineRuns reads the runs' own collection", async () => {
  stubFetch(json(200, { items: [run] }));

  const rows = await client().listRoutineRuns("a1");

  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("GET");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/routine_runs`);
  expect(rows).toEqual([run]);
});

test("the routine reads carry the live x-houston-org", async () => {
  stubFetch(json(200, { items: [] }), json(200, { items: [] }));
  const c = client();
  c.setActiveOrg(ORG);
  await c.listRoutines("a1");
  await c.listRoutineRuns("a1");
  expect(calls.map((call) => call.headers.get("x-houston-org"))).toEqual([
    ORG,
    ORG,
  ]);
});

test("the routine reads percent-encode the agent id they splice", async () => {
  stubFetch(json(200, { items: [] }), json(200, { items: [] }));
  const c = client();
  await c.listRoutines("Home/Ada");
  await c.listRoutineRuns("Home/Ada");
  expect(calls.map((call) => call.url)).toEqual([
    `${BASE}/agents/Home%2FAda/routines`,
    `${BASE}/agents/Home%2FAda/routine_runs`,
  ]);
});

test("a failed routine read propagates as the adapter's engine error", async () => {
  // 404, not a 5xx: the SDK's fetch port carries `cpFetch`'s transient ladder,
  // so a 503 GET would be retried rather than surfaced — as it was before.
  stubFetch(json(404, { error: "no such agent" }));
  await expect(client().listRoutines("a1")).rejects.toMatchObject({
    name: "HoustonEngineError",
    status: 404,
  });
});

// ---- createRoutine / updateRoutine / deleteRoutine ----

test("createRoutine delegates a byte-identical single POST of the whole input", async () => {
  stubFetch(json(200, routine));
  const input = {
    name: "Daily digest",
    prompt: "Summarize the inbox",
    schedule: "0 9 * * *",
  };

  const created = await client().createRoutine("a1", input);

  expect(calls).toHaveLength(1); // no post-write refetch
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/a1/routines`);
  expect(post.body).toBe(JSON.stringify(input));
  expect(post.headers.get("Content-Type")).toBe("application/json");
  expect(post.headers.get("Authorization")).toBe("Bearer t");
  expect(created).toEqual(routine);
});

test("updateRoutine PATCHes only the fields the caller changed", async () => {
  stubFetch(json(200, routine));

  await client().updateRoutine("a1", "r1", { schedule: "0 10 * * *" });

  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("PATCH");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/routines/r1`);
  expect(calls[0].body).toBe(JSON.stringify({ schedule: "0 10 * * *" }));
});

test("deleteRoutine sends a bodiless DELETE", async () => {
  stubFetch(new Response(null, { status: 204 }));

  await client().deleteRoutine("a1", "r1");

  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("DELETE");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/routines/r1`);
  expect(calls[0].body).toBeNull();
});

test("the routine writes percent-encode both spliced ids", async () => {
  stubFetch(json(200, routine), new Response(null, { status: 204 }));
  const c = client();
  await c.updateRoutine("Home/Ada", "r 1/2", { enabled: false });
  await c.deleteRoutine("Home/Ada", "r 1/2");
  expect(calls.map((call) => call.url)).toEqual([
    `${BASE}/agents/Home%2FAda/routines/r%201%2F2`,
    `${BASE}/agents/Home%2FAda/routines/r%201%2F2`,
  ]);
});

test("a failed routine write propagates — never swallowed", async () => {
  stubFetch(json(400, { error: "bad cron" }));
  await expect(
    client().updateRoutine("a1", "r1", { schedule: "nope" }),
  ).rejects.toMatchObject({ name: "HoustonEngineError", status: 400 });
});

// ---- runRoutineNow / cancelRoutineRun ----

test("runRoutineNow POSTs the routine's /run sub-path with no body", async () => {
  stubFetch(new Response(null, { status: 202 }));

  await client().runRoutineNow("a1", "r1");

  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/routines/r1/run`);
  expect(calls[0].body).toBeNull();
  expect(calls[0].headers.get("Authorization")).toBe("Bearer t");
});

test("cancelRoutineRun reaches the run through the routine that owns it", async () => {
  stubFetch(json(200, { ...run, status: "cancelled" }));

  const cancelled = await client().cancelRoutineRun("a1", "r1", "run1");

  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/routines/r1/runs/run1/cancel`);
  expect(cancelled.status).toBe("cancelled");
});

test("the run operations percent-encode every spliced id", async () => {
  stubFetch(new Response(null, { status: 202 }), json(200, run));
  const c = client();
  await c.runRoutineNow("Home/Ada", "r 1/2");
  await c.cancelRoutineRun("Home/Ada", "r 1/2", "run/3");
  expect(calls.map((call) => call.url)).toEqual([
    `${BASE}/agents/Home%2FAda/routines/r%201%2F2/run`,
    `${BASE}/agents/Home%2FAda/routines/r%201%2F2/runs/run%2F3/cancel`,
  ]);
});

test("a failed cancel propagates — a run stuck 'running' must be visible", async () => {
  stubFetch(json(409, { error: "already terminal" }));
  await expect(
    client().cancelRoutineRun("a1", "r1", "run1"),
  ).rejects.toMatchObject({ name: "HoustonEngineError", status: 409 });
});

// ---- mintRoutineWebhookKey ----

test("mintRoutineWebhookKey POSTs the GATEWAY control route, not the agent proxy", async () => {
  const reveal = {
    url: "https://gw/hook/x",
    secret: "s3cr3t",
    key_prefix: "wh_1",
  };
  stubFetch(json(200, reveal));

  const minted = await client().mintRoutineWebhookKey("a1", "r1");

  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  // `/v1/agents/…`: the agent-proxy prefix would forward the mint to a pod that
  // never serves webhook keys, whose 404 would read as "this host can't mint".
  expect(post.url).toBe(`${BASE}/v1/agents/a1/routines/r1/webhook-key`);
  expect(post.body).toBeNull();
  expect(post.headers.get("Authorization")).toBe("Bearer t");
  expect(minted).toEqual(reveal);
});

test("mintRoutineWebhookKey percent-encodes both spliced ids", async () => {
  stubFetch(json(200, { url: "u", secret: "s", key_prefix: "wh_1" }));
  await client().mintRoutineWebhookKey("Home/Ada", "r 1/2");
  expect(calls[0].url).toBe(
    `${BASE}/v1/agents/Home%2FAda/routines/r%201%2F2/webhook-key`,
  );
});

test("a gateway that does not serve webhook keys (404) degrades to null", async () => {
  stubFetch(json(404, { error: "not found" }));
  await expect(client().mintRoutineWebhookKey("a1", "r1")).resolves.toBeNull();
});

test("every other mint failure still surfaces", async () => {
  stubFetch(json(500, { error: "mint failed" }));
  await expect(
    client().mintRoutineWebhookKey("a1", "r1"),
  ).rejects.toMatchObject({ name: "HoustonEngineError", status: 500 });
});

test("off-cloud the mint asks nothing and answers null", async () => {
  stubFetch();
  const standalone = new HoustonClient({ baseUrl: BASE, token: "t" });
  await expect(
    standalone.mintRoutineWebhookKey("a1", "r1"),
  ).resolves.toBeNull();
  expect(calls).toEqual([]);
});
