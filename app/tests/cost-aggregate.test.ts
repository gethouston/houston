import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregate, applyFilter, cacheHitPct, foldFinals, type SessionResult, type FinalResultRow } from "../src/lib/cost-aggregate.ts";
import { calcTokenCost } from "../src/lib/token-pricing.ts";

function session(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    agentName: "Test Agent",
    agentPath: "/agents/test",
    model: "claude-sonnet-4-6",
    cost: 0,
    hasCost: false,
    totalTokens: 0,
    contextTokens: 0,
    cachedTokens: 0,
    date: "2026-06-20",
    hour: 10,
    ...overrides,
  };
}

describe("aggregate", () => {
  it("returns zero totals for empty sessions", () => {
    const m = aggregate([]);
    assert.equal(m.totalCost, 0);
    assert.equal(m.totalSessions, 0);
    assert.equal(m.totalTokens, 0);
    assert.equal(m.hasCostData, false);
    assert.deepEqual(m.byAgent, []);
    assert.deepEqual(m.byModel, []);
  });

  it("sums cost and tokens across sessions", () => {
    const sessions = [
      session({ cost: 0.01, hasCost: true, totalTokens: 1000, cachedTokens: 800 }),
      session({ cost: 0.02, hasCost: true, totalTokens: 2000, cachedTokens: 500 }),
    ];
    const m = aggregate(sessions);
    assert.ok(Math.abs(m.totalCost - 0.03) < 0.000001);
    assert.equal(m.totalSessions, 2);
    assert.equal(m.totalTokens, 3000);
    assert.equal(m.cachedTokens, 1300);
    assert.equal(m.hasCostData, true);
  });

  it("computes cache hit rate over context (input) tokens, not total tokens", () => {
    // 10K context, 8K cached, 5K output. Cache hit must be 8K/10K = 80%,
    // NOT 8K/15K = 53% — output tokens must not dilute the input cache rate.
    const sessions = [
      session({ totalTokens: 15_000, contextTokens: 10_000, cachedTokens: 8_000 }),
    ];
    const m = aggregate(sessions);
    assert.equal(m.cacheEfficiencyPct, 80);
  });

  it("cacheHitPct returns 0 when there are no context tokens", () => {
    assert.equal(cacheHitPct(0, 0), 0);
  });

  it("groups sessions by agent path", () => {
    const sessions = [
      session({ agentPath: "/agents/a", agentName: "A", totalTokens: 100 }),
      session({ agentPath: "/agents/a", agentName: "A", totalTokens: 200 }),
      session({ agentPath: "/agents/b", agentName: "B", totalTokens: 50 }),
    ];
    const m = aggregate(sessions);
    assert.equal(m.byAgent.length, 2);
    const a = m.byAgent.find((x) => x.agentPath === "/agents/a")!;
    assert.equal(a.sessionCount, 2);
    assert.equal(a.totalTokens, 300);
    // sorted by totalTokens descending — A first
    assert.equal(m.byAgent[0].agentPath, "/agents/a");
  });

  it("groups sessions by model", () => {
    const sessions = [
      session({ model: "claude-sonnet-4-6", totalTokens: 500 }),
      session({ model: "claude-sonnet-4-6", totalTokens: 300 }),
      session({ model: "gpt-5.3-codex", totalTokens: 100 }),
    ];
    const m = aggregate(sessions);
    assert.equal(m.byModel.length, 2);
    assert.equal(m.byModel[0].model, "claude-sonnet-4-6");
    assert.equal(m.byModel[0].totalTokens, 800);
    assert.equal(m.byModel[1].model, "gpt-5.3-codex");
  });

  it("skips sessions with empty model in byModel", () => {
    const sessions = [
      session({ model: "", totalTokens: 100 }),
      session({ model: "claude-sonnet-4-6", totalTokens: 200 }),
    ];
    const m = aggregate(sessions);
    assert.equal(m.byModel.length, 1);
  });

  it("groups by day correctly", () => {
    const sessions = [
      session({ date: "2026-06-18", totalTokens: 100 }),
      session({ date: "2026-06-19", totalTokens: 200 }),
      session({ date: "2026-06-18", totalTokens: 50 }),
    ];
    const m = aggregate(sessions);
    assert.equal(m.byDay.length, 2);
    assert.equal(m.byDay[0].date, "2026-06-18");
    assert.equal(m.byDay[0].tokens, 150);
    assert.equal(m.byDay[1].date, "2026-06-19");
    assert.equal(m.byDay[1].tokens, 200);
  });

  it("generates 24 hourly buckets", () => {
    const sessions = [session({ hour: 9, totalTokens: 500 })];
    const m = aggregate(sessions);
    assert.equal(m.byHour.length, 24);
    assert.equal(m.byHour[9].tokens, 500);
    assert.equal(m.byHour[9].sessions, 1);
    assert.equal(m.byHour[0].tokens, 0);
  });

  it("hasCostData is false when no session has cost", () => {
    const m = aggregate([session({ hasCost: false, cost: 0 })]);
    assert.equal(m.hasCostData, false);
  });

  it("hasCostData is true when any session has cost", () => {
    const sessions = [
      session({ hasCost: false }),
      session({ hasCost: true, cost: 0.01 }),
    ];
    const m = aggregate(sessions);
    assert.equal(m.hasCostData, true);
  });
});

describe("applyFilter", () => {
  const sessions = [
    session({ agentPath: "/agents/a", model: "claude-sonnet-4-6" }),
    session({ agentPath: "/agents/a", model: "gpt-5.3-codex" }),
    session({ agentPath: "/agents/b", model: "claude-sonnet-4-6" }),
  ];

  it("'all' returns all sessions", () => {
    assert.equal(applyFilter(sessions, "all", "").length, 3);
  });

  it("'agent' filters by agentPath", () => {
    const filtered = applyFilter(sessions, "agent", "/agents/a");
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((s) => s.agentPath === "/agents/a"));
  });

  it("'model' filters by model name", () => {
    const filtered = applyFilter(sessions, "model", "gpt-5.3-codex");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].agentPath, "/agents/a");
  });

  it("returns empty array when no sessions match", () => {
    assert.equal(applyFilter(sessions, "model", "gemini-2.5-pro").length, 0);
  });
});

describe("foldFinals", () => {
  it("returns zeros for no turns", () => {
    const r = foldFinals([], calcTokenCost);
    assert.deepEqual(r, { model: "", cost: 0, hasCost: false, totalTokens: 0, contextTokens: 0, cachedTokens: 0 });
  });

  it("uses the CLI cost_usd when present (exact)", () => {
    const finals: FinalResultRow[] = [
      { cost_usd: 0.42, model: "claude-sonnet-4-6", usage: { context_tokens: 1000, output_tokens: 100, cached_tokens: 0 } },
    ];
    const r = foldFinals(finals, calcTokenCost);
    assert.equal(r.cost, 0.42);
    assert.equal(r.hasCost, true);
    assert.equal(r.totalTokens, 1100);
    assert.equal(r.contextTokens, 1000);
  });

  it("estimates from tokens when cost_usd is absent", () => {
    // Sonnet: 100K input + 10K output, no cache = (100000*3 + 10000*15)/1e6 = 0.45
    const finals: FinalResultRow[] = [
      { cost_usd: null, model: "claude-sonnet-4-6", usage: { context_tokens: 100_000, output_tokens: 10_000, cached_tokens: 0 } },
    ];
    const r = foldFinals(finals, calcTokenCost);
    assert.ok(Math.abs(r.cost - 0.45) < 1e-9);
    assert.equal(r.hasCost, true);
  });

  it("tracks tokens but no cost when the model is unpriced", () => {
    const finals: FinalResultRow[] = [
      { cost_usd: null, model: "gemini-2.5-pro", usage: { context_tokens: 5000, output_tokens: 500, cached_tokens: 0 } },
    ];
    const r = foldFinals(finals, calcTokenCost);
    assert.equal(r.cost, 0);
    assert.equal(r.hasCost, false);
    assert.equal(r.totalTokens, 5500);
    assert.equal(r.contextTokens, 5000);
  });

  it("sums tokens and cost across multiple turns", () => {
    const finals: FinalResultRow[] = [
      { cost_usd: 0.10, model: "claude-sonnet-4-6", usage: { context_tokens: 1000, output_tokens: 200, cached_tokens: 500 } },
      { cost_usd: 0.20, model: "claude-sonnet-4-6", usage: { context_tokens: 2000, output_tokens: 300, cached_tokens: 800 } },
    ];
    const r = foldFinals(finals, calcTokenCost);
    assert.ok(Math.abs(r.cost - 0.30) < 1e-9);
    assert.equal(r.totalTokens, 3500);
    assert.equal(r.contextTokens, 3000);
    assert.equal(r.cachedTokens, 1300);
  });

  it("handles turns with no usage block", () => {
    const finals: FinalResultRow[] = [
      { cost_usd: 0.05, model: "claude-sonnet-4-6", usage: null },
    ];
    const r = foldFinals(finals, calcTokenCost);
    assert.equal(r.cost, 0.05);
    assert.equal(r.totalTokens, 0);
    assert.equal(r.contextTokens, 0);
  });

  it("keeps the last turn's model as the conversation model", () => {
    const finals: FinalResultRow[] = [
      { cost_usd: 0.01, model: "claude-sonnet-4-6", usage: null },
      { cost_usd: 0.01, model: "claude-opus-4-8", usage: null },
    ];
    assert.equal(foldFinals(finals, calcTokenCost).model, "claude-opus-4-8");
  });
});
