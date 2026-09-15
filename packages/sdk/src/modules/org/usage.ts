/**
 * What the space has been used FOR: the audit trail and the two usage counters
 * the admin screens render.
 *
 * They sit apart from the roster calls in `http.ts` because they read history
 * rather than membership, and their row shapes are read by nothing else — a
 * reader of the roster types never has to page past them. Same transport, same
 * gateway-only `/v1/org*` family, same no-swallow rule: every non-2xx throws
 * the module's {@link OrgHttpError}.
 */

import { type HttpScope, httpRequest } from "../http";

/**
 * One audit-log entry, newest-first from `GET /v1/org/audit`. `action` is a
 * stable slug (e.g. `agent.rename`, `member.add`, `agent.share`); `subject` is
 * action-specific JSON; `createdAt` is epoch milliseconds.
 */
export interface AuditEntry {
  id: number;
  orgId: string;
  actor: string;
  action: string;
  agentSlug?: string;
  subject: unknown;
  createdAt: number;
}

/**
 * One usage-counter row from `GET /v1/org/usage`: message count for an (agent,
 * user, day) tuple. `day` is a `YYYY-MM-DD` UTC date.
 */
export interface UsageRow {
  agentSlug: string;
  userId: string;
  day: string;
  messages: number;
}

/**
 * One compute-usage row: engine running time for an (agent, day) tuple. `day`
 * is a `YYYY-MM-DD` UTC date. `awakeMs` is the wall-clock the agent's engine was
 * up that day (today's row includes the currently-open stretch up to
 * {@link ComputeUsage.asOf}); `activeMs` is the subset spent actually executing
 * turns/routine runs — never sum it with `awakeMs`.
 */
export interface ComputeUsageRow {
  agentSlug: string;
  day: string;
  awakeMs: number;
  activeMs: number;
  wakes: number;
  turns: number;
  routineRuns: number;
}

/** Response of `GET /v1/org/compute-usage`. Days with no data have no row. */
export interface ComputeUsage {
  /** Server clock when the snapshot was taken (RFC 3339). */
  asOf: string;
  /** Slugs of agents whose engine is up right now — their "today" still grows. */
  awakeNow: string[];
  rows: ComputeUsageRow[];
}

/**
 * Shows the record of who did what in this space, newest first.
 * @param before The instant to read back from, in epoch milliseconds; omitted
 *   starts at the newest entry.
 * @param limit How many entries to read; omitted takes the host's own page size.
 * @assistant group:org
 * @assistant unschematized: an audit entry's subject varies per event type and carries the changed record verbatim.
 */
export async function orgAudit(
  scope: HttpScope,
  before?: number,
  limit?: number,
): Promise<AuditEntry[]> {
  const q = new URLSearchParams();
  if (before !== undefined) q.set("before", before.toString());
  if (limit !== undefined) q.set("limit", limit.toString());
  const suffix = q.toString();
  const res = await httpRequest(
    scope,
    `/v1/org/audit${suffix ? `?${suffix}` : ""}`,
  );
  return ((await res.json()) as { entries: AuditEntry[] }).entries;
}

/**
 * Shows how much each person and agent used this space over recent days.
 * @param days How many days back to count, ending today.
 * @assistant group:org
 */
export async function orgUsage(
  scope: HttpScope,
  days: number,
): Promise<UsageRow[]> {
  const res = await httpRequest(
    scope,
    `/v1/org/usage?days=${encodeURIComponent(days.toString())}`,
  );
  return ((await res.json()) as { rows: UsageRow[] }).rows;
}

/**
 * Shows how much running time each agent used over recent days.
 * @param days How many days back to count, ending today.
 * @assistant group:org
 */
export async function computeUsage(
  scope: HttpScope,
  days: number,
): Promise<ComputeUsage> {
  const res = await httpRequest(
    scope,
    `/v1/org/compute-usage?days=${encodeURIComponent(days.toString())}`,
  );
  return (await res.json()) as ComputeUsage;
}
