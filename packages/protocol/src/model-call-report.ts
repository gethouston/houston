export interface ModelCallTiming {
  provider: string;
  model: string;
  ttfbMs: number;
  firstTokenMs?: number;
  firstBlockMs?: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export const MODEL_CALL_STARTUP_STEPS = [
  "harness_init",
  "session_build",
  "queue_wait",
  "pre_prompt",
] as const;
export type ModelCallStartupStep = (typeof MODEL_CALL_STARTUP_STEPS)[number];

export type ModelCallBackend = "claude" | "pi";

export const MODEL_CALL_REPORT_MAX_CALLS = 64;

export interface ModelCallReport {
  v: 1;
  turnId: string;
  backend: ModelCallBackend;
  startupMs: Partial<Record<ModelCallStartupStep, number>>;
  calls: ModelCallTiming[];
  droppedCalls: number;
}

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function parseCall(value: unknown): ModelCallTiming | undefined {
  if (!value || typeof value !== "object") return undefined;
  const c = value as Record<string, unknown>;
  const numbers = [
    c.ttfbMs,
    c.inputTokens,
    c.cacheReadTokens,
    c.cacheWriteTokens,
    c.outputTokens,
  ];
  if (typeof c.provider !== "string" || typeof c.model !== "string")
    return undefined;
  if (!numbers.every(finiteNonNegative)) return undefined;
  for (const optional of [c.firstTokenMs, c.firstBlockMs])
    if (optional !== undefined && !finiteNonNegative(optional))
      return undefined;
  return {
    provider: c.provider,
    model: c.model,
    ttfbMs: c.ttfbMs as number,
    ...(c.firstTokenMs !== undefined
      ? { firstTokenMs: c.firstTokenMs as number }
      : {}),
    ...(c.firstBlockMs !== undefined
      ? { firstBlockMs: c.firstBlockMs as number }
      : {}),
    inputTokens: c.inputTokens as number,
    cacheReadTokens: c.cacheReadTokens as number,
    cacheWriteTokens: c.cacheWriteTokens as number,
    outputTokens: c.outputTokens as number,
  };
}

export function parseModelCallReport(
  value: unknown,
): ModelCallReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as Record<string, unknown>;
  if (r.v !== 1 || typeof r.turnId !== "string" || !r.turnId) return undefined;
  if (r.backend !== "claude" && r.backend !== "pi") return undefined;
  if (!Array.isArray(r.calls)) return undefined;
  const startupIn =
    r.startupMs && typeof r.startupMs === "object"
      ? (r.startupMs as Record<string, unknown>)
      : {};
  const startupMs: ModelCallReport["startupMs"] = {};
  for (const step of MODEL_CALL_STARTUP_STEPS)
    if (finiteNonNegative(startupIn[step])) startupMs[step] = startupIn[step];
  const calls = r.calls
    .slice(0, MODEL_CALL_REPORT_MAX_CALLS)
    .map(parseCall)
    .filter((c): c is ModelCallTiming => c !== undefined);
  const dropped = finiteNonNegative(r.droppedCalls) ? r.droppedCalls : 0;
  return {
    v: 1,
    turnId: r.turnId,
    backend: r.backend,
    startupMs,
    calls,
    droppedCalls:
      dropped + Math.max(0, r.calls.length - MODEL_CALL_REPORT_MAX_CALLS),
  };
}
