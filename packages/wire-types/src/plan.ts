/** C19 personal-plan wire shapes. A plan belongs to a person, across spaces. */
export interface PlanSummary {
  plan: "free" | "plus";
  usage?: { percent: number; used: number; limit: number; resetsAt?: string };
  plus: {
    status: "none" | "active" | "past_due" | "lapsed";
    renewsAt?: string;
    cancelAtPeriodEnd?: boolean;
    /** The person has a Stripe customer, so the portal (Manage) works. False
     * for an operator-granted Plus, whose portal answers `409 no_subscription`. */
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
      coversFrom: string;
      coversUntil: string;
      endsAt: string;
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

export interface MessageLimitRefusal {
  error: string;
  code: "message_limit";
  limit: number;
  resetsAt: string;
}

/** Parse only the exact C19 refusal; other 429s keep their existing handling. */
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
  return {
    error: value.error,
    code: "message_limit",
    limit: value.limit,
    resetsAt: value.resetsAt,
  };
}
