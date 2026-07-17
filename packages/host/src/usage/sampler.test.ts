import { describe, expect, it } from "vitest";
import type { ChannelCtx } from "../ports";
import { UsageSampler, type UsageSamplerOptions } from "./sampler";

const CTX = {
  workspace: { id: "Personal" },
  agent: { id: "Personal/Alfred" },
} as unknown as ChannelCtx;

/** Noon UTC on a fixed day — far from midnight unless a test wants it. */
const NOON = Date.UTC(2026, 6, 15, 12, 0, 0);

function build(overrides: Partial<UsageSamplerOptions> = {}) {
  const state = {
    now: NOON,
    turnBusy: false,
    runIds: [] as string[],
    requests: [] as { url: string; body: unknown }[],
    responseStatus: 200,
    fetchError: null as Error | null,
    logs: [] as string[],
  };
  const sampler = new UsageSampler({
    report: {
      url: "https://gw.example/",
      orgSlug: "org1",
      agentSlug: "agent1",
      podToken: "tok",
    },
    listAgents: async () => [CTX],
    turnBusy: async () => state.turnBusy,
    runningRoutineRuns: async () => state.runIds,
    now: () => state.now,
    fetchImpl: (async (url: string, init: RequestInit) => {
      if (state.fetchError) throw state.fetchError;
      state.requests.push({ url, body: JSON.parse(init.body as string) });
      return { ok: state.responseStatus < 400, status: state.responseStatus };
    }) as unknown as typeof fetch,
    log: (message) => state.logs.push(message),
    ...overrides,
  });
  return { sampler, state };
}

interface ReportBody {
  bootId: string;
  days: { day: string; activeMs: number; turns: number; routineRuns: number }[];
}

function body(state: { requests: { body: unknown }[] }, index: number) {
  const request = state.requests.at(index);
  if (!request) throw new Error(`no request at index ${index}`);
  return request.body as ReportBody;
}

const lastBody = (state: { requests: { body: unknown }[] }) => body(state, -1);

function lastDay(state: { requests: { body: unknown }[] }) {
  const day = lastBody(state).days[0];
  if (!day) throw new Error("report carried no days");
  return day;
}

describe("UsageSampler", () => {
  it("accrues busy time and caps a late tick at twice the sample interval", async () => {
    const { sampler, state } = build();
    await sampler.tick(); // establishes lastTickAt, idle
    state.turnBusy = true;
    state.now += 5_000;
    await sampler.tick();
    // A starved loop: 60s since the last tick must credit at most 10s.
    state.now += 60_000;
    await sampler.tick();
    await sampler.flush();
    expect(lastBody(state).days).toEqual([
      { day: "2026-07-15", activeMs: 15_000, turns: 1, routineRuns: 0 },
    ]);
  });

  it("does not accrue while idle", async () => {
    const { sampler, state } = build();
    await sampler.tick();
    state.now += 5_000;
    await sampler.tick();
    await sampler.flush();
    expect(state.requests).toHaveLength(0);
  });

  it("splits a busy stretch across the UTC midnight boundary", async () => {
    const { sampler, state } = build();
    state.now = Date.UTC(2026, 6, 15, 23, 59, 58);
    await sampler.tick();
    state.turnBusy = true;
    state.now += 5_000; // 23:59:58 -> 00:00:03 next day
    await sampler.tick();
    await sampler.flush();
    expect(lastBody(state).days).toEqual([
      { day: "2026-07-15", activeMs: 2_000, turns: 0, routineRuns: 0 },
      { day: "2026-07-16", activeMs: 3_000, turns: 1, routineRuns: 0 },
    ]);
  });

  it("counts rising edges once per turn and per routine run", async () => {
    const { sampler, state } = build();
    await sampler.tick();
    state.turnBusy = true;
    state.runIds = ["run-a"];
    state.now += 5_000;
    await sampler.tick();
    state.now += 5_000;
    await sampler.tick(); // same turn + run still going: no new counts
    state.turnBusy = false;
    state.runIds = [];
    state.now += 5_000;
    await sampler.tick();
    state.turnBusy = true;
    state.runIds = ["run-b"];
    state.now += 5_000;
    await sampler.tick();
    await sampler.flush();
    expect(lastDay(state).turns).toBe(2);
    expect(lastDay(state).routineRuns).toBe(2);
  });

  it("reports cumulative totals so a replayed flush is idempotent server-side", async () => {
    const { sampler, state } = build();
    await sampler.tick();
    state.turnBusy = true;
    state.now += 5_000;
    await sampler.tick(); // rising edge: flushes immediately (request #1)
    await sampler.flush();
    state.now += 5_000;
    await sampler.tick();
    await sampler.flush();
    expect(state.requests).toHaveLength(3);
    expect(body(state, 0).days[0]?.activeMs).toBe(5_000);
    expect(lastDay(state).activeMs).toBe(10_000);
    // Same boot: the gateway GREATEST-upserts on (bootId, day).
    expect(body(state, 0).bootId).toBe(lastBody(state).bootId);
  });

  it("flushes on busy edges with a floor, so turns surface without waiting for the interval", async () => {
    const { sampler, state } = build();
    await sampler.tick();
    state.turnBusy = true;
    state.now += 5_000;
    await sampler.tick(); // rising edge -> immediate report
    expect(state.requests).toHaveLength(1);
    expect(lastDay(state).turns).toBe(1);
    state.now += 5_000;
    await sampler.tick(); // still busy: no edge, no extra report
    expect(state.requests).toHaveLength(1);
    state.turnBusy = false;
    state.now += 5_000;
    await sampler.tick(); // falling edge -> the finished turn's time reports
    expect(state.requests).toHaveLength(2);
    // The idle tick's own stretch is never credited (the turn ended somewhere
    // inside it — bounded undercount): 2 busy ticks x 5s.
    expect(lastDay(state).activeMs).toBe(10_000);
  });

  it("keeps the accumulator through rejected and failed reports, logging each failure once", async () => {
    const { sampler, state } = build();
    await sampler.tick();
    state.turnBusy = true;
    state.now += 5_000;
    await sampler.tick();
    state.responseStatus = 404;
    await sampler.flush();
    await sampler.flush();
    expect(state.logs.filter((l) => l.includes("404"))).toHaveLength(1);
    state.fetchError = new Error("network down");
    await sampler.flush();
    expect(state.logs.some((l) => l.includes("network down"))).toBe(true);
    state.fetchError = null;
    state.responseStatus = 200;
    await sampler.flush();
    expect(lastDay(state).activeMs).toBe(5_000);
  });

  it("stop() drains a final sample and flush", async () => {
    const { sampler, state } = build();
    await sampler.tick();
    state.turnBusy = true;
    state.now += 5_000;
    await sampler.stop();
    expect(lastDay(state).activeMs).toBe(5_000);
    await sampler.stop(); // idempotent
    // stop() drains via one edge flush (the final sample sees the rising
    // edge) plus the terminal flush; a second stop adds nothing.
    expect(state.requests).toHaveLength(2);
  });

  it("never accrues or reports after a failed sample", async () => {
    const { sampler, state } = build({
      turnBusy: async () => {
        throw new Error("runtime probe exploded");
      },
    });
    await sampler.tick();
    state.now += 5_000;
    await sampler.tick();
    await sampler.flush();
    expect(state.requests).toHaveLength(0);
    expect(state.logs.some((l) => l.includes("sample failed"))).toBe(true);
  });
});
