import { HoustonClient } from "@houston/engine-adapter/client";
import {
  isWebhookKeyNotCreatorRefusal,
  planMinIntervalRefusal,
  routinePauseNotice,
  routineSnoozeNotice,
} from "@houston/sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createWireCapture, json, ORG } from "./support/wire-capture";

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

test("listRoutines delegates a byte-identical single GET /agents/:id/routines", async () => {
  stubFetch(json(200, { items: [routine] }));

  const rows = await client().listRoutines("a1");

  expect(calls).toHaveLength(1);
  const [get] = calls;
  expect(get.method).toBe("GET");
  expect(get.url).toBe(`${BASE}/agents/a1/routines`);
  expect(get.body).toBeNull();
  expect(get.headers.get("Content-Type")).toBe("application/json");
  expect(get.headers.get("Authorization")).toBe("Bearer t");
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

test("delivery failures and resumed runs survive the SDK binding", async () => {
  const failed = {
    ...run,
    status: "error" as const,
    session_key: "",
    delivery_failure: { code: "pool_delivery_expired" as const },
  };
  const resumed = { ...run, resumed: true as const };
  stubFetch(json(200, { items: [failed, resumed] }));
  const c = client();
  c.setActiveOrg(ORG);

  expect(await c.listRoutineRuns("a1")).toEqual([failed, resumed]);
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("GET");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/routine_runs`);
  expect(calls[0].body).toBeNull();
  expect(calls[0].headers.get("Content-Type")).toBe("application/json");
  expect(calls[0].headers.get("Authorization")).toBe("Bearer t");
  expect(calls[0].headers.get("x-houston-org")).toBe(ORG);
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
  stubFetch(json(404, { error: "no such agent" }));
  await expect(client().listRoutines("a1")).rejects.toMatchObject({
    name: "HoustonEngineError",
    status: 404,
  });
});

test("createRoutine delegates a byte-identical single POST of the whole input", async () => {
  stubFetch(json(200, routine));
  const input = {
    name: "Daily digest",
    prompt: "Summarize the inbox",
    schedule: "0 9 * * *",
  };

  const created = await client().createRoutine("a1", input);

  expect(calls).toHaveLength(1);
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

test("an engine snooze reaches the SDK notice while it holds, and a model change is a plain PATCH", async () => {
  const snoozed = {
    ...routine,
    snoozed: {
      reason: "usage_limit" as const,
      provider: "anthropic",
      model: "claude-fable-5",
      until: "2026-10-13T05:00:00.000Z",
      at: "2026-10-08T20:47:30.000Z",
    },
  };
  stubFetch(json(200, { items: [snoozed] }), json(200, routine));

  const [row] = await client().listRoutines("a1");
  expect(row?.snoozed).toEqual(snoozed.snoozed);
  expect(row?.enabled).toBe(true);
  const during = new Date("2026-10-09T12:00:00.000Z");
  expect(row && routineSnoozeNotice(row, during)).toEqual({
    provider: "anthropic",
    model: "claude-fable-5",
    until: "2026-10-13T05:00:00.000Z",
    snoozedAt: "2026-10-08T20:47:30.000Z",
  });
  expect(
    row && routineSnoozeNotice(row, new Date("2026-10-13T05:00:00.000Z")),
  ).toBeNull();

  await client().updateRoutine("a1", "r1", { model: "claude-sonnet-4-5" });
  expect(calls).toHaveLength(2);
  expect(calls[1].method).toBe("PATCH");
  expect(calls[1].url).toBe(`${BASE}/agents/a1/routines/r1`);
  expect(calls[1].body).toBe(JSON.stringify({ model: "claude-sonnet-4-5" }));
});

test("an engine auto-pause reaches the SDK notice, and resuming is a plain enabled PATCH", async () => {
  const paused = {
    ...routine,
    enabled: false,
    auto_paused: {
      reason: "creator_needs_reconnect" as const,
      provider: "anthropic",
      failures: 10,
      at: "2026-09-29T11:00:00.000Z",
    },
  };
  stubFetch(json(200, { items: [paused] }), json(200, routine));

  const [row] = await client().listRoutines("a1");
  expect(row?.auto_paused).toEqual(paused.auto_paused);
  expect(row && routinePauseNotice(row)).toEqual({
    remedy: "reconnect_account",
    account: "creator",
    provider: "anthropic",
    failures: 10,
    pausedAt: "2026-09-29T11:00:00.000Z",
  });

  await client().updateRoutine("a1", "r1", { enabled: true });
  expect(calls).toHaveLength(2);
  expect(calls[1].method).toBe("PATCH");
  expect(calls[1].url).toBe(`${BASE}/agents/a1/routines/r1`);
  expect(calls[1].body).toBe(JSON.stringify({ enabled: true }));
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

test("a routine write the shared compute had no room for goes out again, byte-identical", async () => {
  stubFetch(
    json(503, {
      error: "agent busy; retry in a moment",
      code: "compute_busy",
      retryAfterMs: 1,
    }),
    json(200, routine),
  );
  const input = { name: "Daily digest", prompt: "p", schedule: "0 9 * * *" };

  const created = await client().createRoutine("a1", input);

  expect(calls).toHaveLength(2);
  expect(calls[1].method).toBe("POST");
  expect(calls[1].url).toBe(`${BASE}/agents/a1/routines`);
  expect(calls[1].body).toBe(calls[0].body);
  expect(calls[1].headers.get("Authorization")).toBe("Bearer t");
  expect(created).toEqual(routine);
});

test("a failed routine write propagates — never swallowed", async () => {
  stubFetch(json(400, { error: "bad cron" }));
  await expect(
    client().updateRoutine("a1", "r1", { schedule: "nope" }),
  ).rejects.toMatchObject({ name: "HoustonEngineError", status: 400 });
});

test("a plan-floor refusal reaches the caller whole, classified as an expected state", async () => {
  const refusal = {
    error:
      "This person's plan runs a scheduled task at most once every 15 minutes, so nothing was saved. Ask whether every 15 minutes or slower works, then save again; upgrading the plan removes this limit.",
    code: "plan_min_interval",
    minIntervalMinutes: 15,
  };
  for (const write of [
    () =>
      client().createRoutine("a1", {
        name: "Inbox",
        prompt: "Check it",
        schedule: "*/5 * * * *",
      }),
    () => client().updateRoutine("a1", "r1", { schedule: "*/5 * * * *" }),
  ]) {
    reset();
    stubFetch(json(400, refusal));
    const err = await write().then(
      () => null,
      (e: unknown) => e,
    );
    expect(calls).toHaveLength(1);
    expect(err).toMatchObject({ name: "HoustonEngineError", status: 400 });
    expect(planMinIntervalRefusal(err)).toEqual(refusal);
  }
});

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

test("a mint by someone other than the creator (403 not_creator) is the typed refusal", async () => {
  stubFetch(
    json(403, {
      error:
        "only the routine's creator can create or rotate its webhook address",
      code: "not_creator",
    }),
  );
  const failure = await client()
    .mintRoutineWebhookKey("a1", "r1")
    .then(
      () => null,
      (err: unknown) => err,
    );
  expect(failure).toMatchObject({ name: "HoustonEngineError", status: 403 });
  expect(isWebhookKeyNotCreatorRefusal(failure)).toBe(true);
  stubFetch(json(403, { error: "not assigned", code: "not_assigned" }));
  const other = await client()
    .mintRoutineWebhookKey("a1", "r1")
    .then(
      () => null,
      (err: unknown) => err,
    );
  expect(isWebhookKeyNotCreatorRefusal(other)).toBe(false);
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
