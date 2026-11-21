export interface PlanSummary {
  plan: "free" | "plus";
  usage?: { percent: number; used: number; limit: number; resetsAt?: string };
  plus: {
    status: "none" | "active" | "past_due" | "lapsed";
    renewsAt?: string;
    cancelAtPeriodEnd?: boolean;
    manageable: boolean;
    price: {
      amount: number;
      currency: string;
      interval: "month";
      compareAt?: number;
    };
    offer?: {
      amount: number;
      currency: string;
    };
  };
  limitsStartAt?: string;
  announcement: boolean;
  routines?: {
    paused: boolean;
    maxActive: 1;
    minIntervalMinutes: 15;
    kept?: PlanRoutineKey;
    needsChoice: boolean;
    limitedCount: number;
  };
}

export interface PlanRoutineKey {
  orgSlug: string;
  agentSlug: string;
  routineId: string;
}

export interface PlanRoutine extends PlanRoutineKey {
  orgName: string;
  agentName: string;
  name?: string;
  kind: "schedule" | "trigger";
  schedule?: string;
  runsLast7d: number;
  kept: boolean;
}

export interface PlanCheckout {
  url: string;
}

export interface PlusInvoice {
  id: string;
  number?: string;
  createdAt: string;
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  hostedUrl?: string;
  pdfUrl?: string;
}

export const MESSAGE_LIMIT_SCOPES = ["org", "seat"] as const;
export type MessageLimitScope = (typeof MESSAGE_LIMIT_SCOPES)[number];

export interface MessageLimitRefusal {
  error: string;
  code: "message_limit";
  limit: number;
  resetsAt: string;
  scope?: MessageLimitScope;
}

export function parseMessageLimitRefusal(
  body: unknown,
): MessageLimitRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    value.code !== "message_limit" ||
    typeof value.error !== "string" ||
    typeof value.limit !== "number" ||
    !Number.isFinite(value.limit) ||
    typeof value.resetsAt !== "string" ||
    !Number.isFinite(Date.parse(value.resetsAt))
  )
    return null;
  const scope = MESSAGE_LIMIT_SCOPES.find((known) => known === value.scope);
  return {
    error: value.error,
    code: "message_limit",
    limit: value.limit,
    resetsAt: value.resetsAt,
    ...(scope ? { scope } : {}),
  };
}

export {
  PLAN_MIN_INTERVAL,
  type PlanMinIntervalRefusal,
  parsePlanMinIntervalRefusal,
} from "@houston/protocol/plan-min-interval";
