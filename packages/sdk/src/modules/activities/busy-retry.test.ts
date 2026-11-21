import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { WAKING_CREATE_RETRY_MS, WRITE_RETRY_BUDGET_MS } from "./busy-retry";

const BASE = "http://127.0.0.1:4317";
const AGENT = "ag_1";
const BUSY = JSON.stringify({ error: "agent busy; retry in a moment" });
const WAKING = JSON.stringify({ error: "engine unavailable" });

type Answer = () => Response;

const refusal =
  (status: number, body: string, retryAfter?: string): Answer =>
  () =>
    new Response(body, {
      status,
      headers: retryAfter === undefined ? {} : { "Retry-After": retryAfter },
    });

const card: Answer = () =>
  new Response(JSON.stringify({ id: "m1", title: "T", status: "running" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function makeSdk(answers: Answer[]) {
  const pauses: number[] = [];
  let attempts = 0;
  const fetchImpl = vi.fn(async (): Promise<Response> => {
    const answer = answers[Math.min(attempts, answers.length - 1)];
    attempts += 1;
    return answer();
  });
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(new Map()),
    devicePreferences: memoryKv(),
    clock: {
      now: () => 0,
      setTimeout: (fn, ms) => {
        pauses.push(ms);
        queueMicrotask(fn);
        return pauses.length;
      },
      clearTimeout: () => {},
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), pauses, attempts: () => attempts };
}

describe("board-card writes retry a busy or waking refusal", () => {
  it("create waits out a busy 503 for its Retry-After, then resolves the card", async () => {
    const { sdk, pauses, attempts } = makeSdk([refusal(503, BUSY, "2"), card]);
    const created = await sdk.activities.writes.create(AGENT, { title: "T" });
    expect(created).toMatchObject({ id: "m1" });
    expect(attempts()).toBe(2);
    expect(pauses).toEqual([2_000]);
    sdk.dispose();
  });

  it("update retries the gateway's plain-text busy body", async () => {
    const { sdk, pauses, attempts } = makeSdk([
      refusal(503, "agent busy; retry in a moment\n", "2"),
      card,
    ]);
    const updated = await sdk.activities.writes.setStatus(AGENT, "m1", "done");
    expect(updated).toMatchObject({ id: "m1" });
    expect(attempts()).toBe(2);
    expect(pauses).toEqual([2_000]);
    sdk.dispose();
  });

  it("a coded busy refusal rides one budget, the HTTP seam's, never two stacked", async () => {
    const coded = JSON.stringify({
      error: "agent busy; retry in a moment",
      code: "compute_busy",
      retryAfterMs: 8_000,
    });
    const { sdk, pauses, attempts } = makeSdk([refusal(503, coded)]);
    await expect(
      sdk.activities.writes.update(AGENT, "m1", { title: "x" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(pauses).toEqual([8_000, 8_000]);
    expect(attempts()).toBe(3);
    sdk.dispose();
  });

  it("a coded pod_wake_refused on a waking-ladder create rides one budget, not one per rung", async () => {
    const refused = JSON.stringify({
      error: "engine unavailable",
      code: "pod_wake_refused",
      retryAfterMs: 8_000,
    });
    const { sdk, pauses, attempts } = makeSdk([refusal(503, refused)]);
    await expect(
      sdk.activities.writes.create(
        AGENT,
        { id: "m1", title: "T" },
        { retryWhileWaking: true },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(pauses).toEqual([8_000, 8_000]);
    expect(attempts()).toBe(3);
    sdk.dispose();
  });

  it("a waking refusal on an update surfaces at once, as before the SDK retried", async () => {
    const { sdk, pauses, attempts } = makeSdk([refusal(503, WAKING), card]);
    await expect(
      sdk.activities.writes.update(AGENT, "m1", { title: "x" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(attempts()).toBe(1);
    expect(pauses).toEqual([]);
    sdk.dispose();
  });

  it("a waking refusal on a create without the opt-in surfaces at once", async () => {
    const { sdk, pauses, attempts } = makeSdk([refusal(503, WAKING), card]);
    await expect(
      sdk.activities.writes.create(AGENT, { id: "m1", title: "T" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(attempts()).toBe(1);
    expect(pauses).toEqual([]);
    sdk.dispose();
  });

  it("the optimistic mission row walks the app's old waking ladder, ignoring Retry-After", async () => {
    const { sdk, pauses, attempts } = makeSdk([
      refusal(503, WAKING, "2"),
      refusal(502, JSON.stringify({ error: "engine proxy failed" })),
      refusal(503, WAKING),
      card,
    ]);
    const created = await sdk.activities.writes.create(
      AGENT,
      { id: "m1", title: "T" },
      { retryWhileWaking: true },
    );
    expect(created).toMatchObject({ id: "m1" });
    expect(attempts()).toBe(4);
    expect(pauses).toEqual([...WAKING_CREATE_RETRY_MS]);
    expect(pauses).toEqual([5_000, 15_000, 30_000]);
    sdk.dispose();
  });

  it("an exhausted waking ladder surfaces the last refusal after four attempts", async () => {
    const { sdk, pauses, attempts } = makeSdk([refusal(503, WAKING)]);
    await expect(
      sdk.activities.writes.create(
        AGENT,
        { id: "m1", title: "T" },
        { retryWhileWaking: true },
      ),
    ).rejects.toMatchObject({ name: "ActivitiesHttpError", status: 503 });
    expect(attempts()).toBe(4);
    expect(pauses).toEqual([5_000, 15_000, 30_000]);
    sdk.dispose();
  });

  it("an id-less create never re-issues a waking refusal, even when asked", async () => {
    const { sdk, attempts } = makeSdk([refusal(503, WAKING), card]);
    await expect(
      sdk.activities.writes.create(
        AGENT,
        { title: "T" },
        { retryWhileWaking: true },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(attempts()).toBe(1);
    sdk.dispose();
  });

  it.each([
    ["a 400", refusal(400, JSON.stringify({ error: "bad title" }))],
    ["a bare 500", refusal(500, "boom")],
    ["a 503 with another reason", refusal(503, "quota page", "2")],
  ])("%s surfaces at once, never retried", async (_label, answer) => {
    const { sdk, pauses, attempts } = makeSdk([answer, card]);
    await expect(
      sdk.activities.writes.create(AGENT, { title: "T" }),
    ).rejects.toMatchObject({ name: "ActivitiesHttpError" });
    expect(attempts()).toBe(1);
    expect(pauses).toEqual([]);
    sdk.dispose();
  });

  it("an agent busy for good gives up at the pause budget with the last refusal", async () => {
    const { sdk, pauses, attempts } = makeSdk([refusal(503, BUSY, "2")]);
    await expect(
      sdk.activities.writes.update(AGENT, "m1", { title: "x" }),
    ).rejects.toMatchObject({ name: "ActivitiesHttpError", status: 503 });
    expect(pauses).toEqual(Array(10).fill(2_000));
    expect(pauses.reduce((a, b) => a + b, 0)).toBe(WRITE_RETRY_BUDGET_MS);
    expect(attempts()).toBe(11);
    sdk.dispose();
  });

  it("a Retry-After of 0 still pauses, so the budget always runs out", async () => {
    const { sdk, pauses } = makeSdk([refusal(503, BUSY, "0")]);
    await expect(
      sdk.activities.writes.create(AGENT, { title: "T" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(pauses).toEqual(Array(40).fill(500));
    sdk.dispose();
  });

  it("a Retry-After past the budget surfaces the refusal without pausing", async () => {
    const { sdk, pauses, attempts } = makeSdk([refusal(503, BUSY, "60"), card]);
    await expect(
      sdk.activities.writes.create(AGENT, { title: "T" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(pauses).toEqual([]);
    expect(attempts()).toBe(1);
    sdk.dispose();
  });
});
