/** A persisted `final_result` feed row's data payload (one provider turn). */
export interface FinalResultRow {
  cost_usd?: number | null;
  model?: string | null;
  usage?: { context_tokens: number; output_tokens: number; cached_tokens: number } | null;
}

/** Cost and token totals folded from one conversation's final-result turns. */
export interface FoldedUsage {
  model: string;
  cost: number;
  hasCost: boolean;
  totalTokens: number;
  contextTokens: number;
  cachedTokens: number;
}

/** Estimate a turn's cost from its model and token counts, or null if unpriced. */
export type CostEstimator = (
  model: string,
  contextTokens: number,
  outputTokens: number,
  cachedTokens: number,
) => number | null;

/**
 * Fold a conversation's final-result turns into a single usage record.
 *
 * Per turn: use the CLI's `cost_usd` when present (exact), otherwise estimate
 * from the model + token usage via `estimate`. Tokens are summed across turns
 * (each turn is a separately billed request). `model` is the last turn's model,
 * used to label the conversation in the by-model breakdown.
 *
 * The estimator is injected so this stays free of pricing-table imports.
 */
export function foldFinals(finals: FinalResultRow[], estimate: CostEstimator): FoldedUsage {
  let model = "", cost = 0, hasCost = false;
  let totalTokens = 0, contextTokens = 0, cachedTokens = 0;

  for (const d of finals) {
    if (d.model) model = d.model;
    if (d.cost_usd != null) {
      cost += d.cost_usd;
      hasCost = true;
    } else if (d.model && d.usage) {
      const estimated = estimate(d.model, d.usage.context_tokens, d.usage.output_tokens, d.usage.cached_tokens);
      if (estimated != null) {
        cost += estimated;
        hasCost = true;
      }
    }
    if (d.usage) {
      totalTokens += d.usage.context_tokens + d.usage.output_tokens;
      contextTokens += d.usage.context_tokens;
      cachedTokens += d.usage.cached_tokens;
    }
  }

  return { model, cost, hasCost, totalTokens, contextTokens, cachedTokens };
}

export interface SessionResult {
  agentName: string;
  agentPath: string;
  model: string;
  cost: number;
  hasCost: boolean;
  /** All tokens billed this session (input + output). */
  totalTokens: number;
  /** Input (context) tokens only, the denominator for cache hit rate. */
  contextTokens: number;
  /** Cache-read tokens (a subset of contextTokens). */
  cachedTokens: number;
  date: string;
  hour: number;
}

export interface AgentMetrics {
  agentName: string;
  agentPath: string;
  totalCost: number;
  hasCost: boolean;
  sessionCount: number;
  totalTokens: number;
  contextTokens: number;
  cachedTokens: number;
}

export interface ModelMetrics {
  model: string;
  sessionCount: number;
  totalTokens: number;
  contextTokens: number;
  cachedTokens: number;
  totalCost: number;
  hasCost: boolean;
}

/** Cache hit rate as a 0-100 percent: cache reads over total input tokens. */
export function cacheHitPct(cachedTokens: number, contextTokens: number): number {
  return contextTokens > 0 ? Math.round((cachedTokens / contextTokens) * 100) : 0;
}

export interface DailyMetrics {
  date: string;
  cost: number;
  tokens: number;
}

export interface HourlyMetrics {
  hour: number;
  tokens: number;
  sessions: number;
}

export interface AggregatedMetrics {
  totalCost: number;
  totalSessions: number;
  totalTokens: number;
  contextTokens: number;
  cachedTokens: number;
  cacheEfficiencyPct: number;
  hasCostData: boolean;
  byAgent: AgentMetrics[];
  byModel: ModelMetrics[];
  byDay: DailyMetrics[];
  byHour: HourlyMetrics[];
}

export function aggregate(sessions: SessionResult[]): AggregatedMetrics {
  const agentMap = new Map<string, AgentMetrics>();
  const modelMap = new Map<string, ModelMetrics>();
  const dayMap = new Map<string, { cost: number; tokens: number }>();
  const hourMap = new Map<number, { tokens: number; sessions: number }>();
  let totalCost = 0, totalTokens = 0, contextTokens = 0, cachedTokens = 0;
  let hasCostData = false;

  for (const s of sessions) {
    totalCost += s.cost;
    totalTokens += s.totalTokens;
    contextTokens += s.contextTokens;
    cachedTokens += s.cachedTokens;
    if (s.hasCost) hasCostData = true;

    const ag = agentMap.get(s.agentPath);
    if (ag) {
      ag.totalCost += s.cost;
      ag.sessionCount += 1;
      ag.totalTokens += s.totalTokens;
      ag.contextTokens += s.contextTokens;
      ag.cachedTokens += s.cachedTokens;
      if (s.hasCost) ag.hasCost = true;
    } else {
      agentMap.set(s.agentPath, {
        agentName: s.agentName, agentPath: s.agentPath,
        totalCost: s.cost, hasCost: s.hasCost, sessionCount: 1,
        totalTokens: s.totalTokens, contextTokens: s.contextTokens, cachedTokens: s.cachedTokens,
      });
    }

    if (s.model) {
      const md = modelMap.get(s.model);
      if (md) {
        md.sessionCount += 1;
        md.totalTokens += s.totalTokens;
        md.contextTokens += s.contextTokens;
        md.cachedTokens += s.cachedTokens;
        md.totalCost += s.cost;
        if (s.hasCost) md.hasCost = true;
      } else {
        modelMap.set(s.model, {
          model: s.model, sessionCount: 1, totalTokens: s.totalTokens,
          contextTokens: s.contextTokens, cachedTokens: s.cachedTokens,
          totalCost: s.cost, hasCost: s.hasCost,
        });
      }
    }

    if (s.date) {
      const d = dayMap.get(s.date) ?? { cost: 0, tokens: 0 };
      d.cost += s.cost;
      d.tokens += s.totalTokens;
      dayMap.set(s.date, d);
    }

    if (s.hour >= 0) {
      const h = hourMap.get(s.hour) ?? { tokens: 0, sessions: 0 };
      h.tokens += s.totalTokens;
      h.sessions += 1;
      hourMap.set(s.hour, h);
    }
  }

  const byDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const byHour = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    tokens: hourMap.get(i)?.tokens ?? 0,
    sessions: hourMap.get(i)?.sessions ?? 0,
  }));

  const byAgent = [...agentMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const byModel = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    totalCost, totalSessions: sessions.length, totalTokens, contextTokens, cachedTokens,
    cacheEfficiencyPct: cacheHitPct(cachedTokens, contextTokens),
    hasCostData, byAgent, byModel, byDay, byHour,
  };
}

export function applyFilter(
  sessions: SessionResult[],
  kind: "all" | "agent" | "model",
  value: string,
): SessionResult[] {
  if (kind === "all") return sessions;
  if (kind === "agent") return sessions.filter((s) => s.agentPath === value);
  return sessions.filter((s) => s.model === value);
}
