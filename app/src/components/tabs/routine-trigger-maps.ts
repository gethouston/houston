import type { Routine, TriggerStatusItem } from "@houston-ai/engine-client";

/**
 * Pure read-model helpers the Routines tab uses to feed the grid's trigger
 * surface (C9 event-driven routines): the per-routine status lookup and the
 * humanized "wakes on an event in {app}" summaries. Kept DOM/React-free so they
 * unit-test under bare node.
 */

/** Index a trigger-status list by routine id (empty when the host serves none). */
export function toStatusMap(
  items: TriggerStatusItem[] | null | undefined,
): Record<string, TriggerStatusItem> {
  const out: Record<string, TriggerStatusItem> = {};
  for (const item of items ?? []) out[item.routine_id] = item;
  return out;
}

/**
 * Build a human wake summary per trigger routine. For a Composio app-event
 * binding, `appName` resolves a toolkit slug to its display name and `render`
 * turns that name into the localized line (the app passes a `t()` closure). For
 * an incoming-webhook binding there is no app, so the already-localized
 * `webhookLabel` is used verbatim. Schedule-only routines are skipped.
 */
export function toTriggerSummaries(
  routines: Routine[],
  appName: (toolkit: string) => string,
  render: (app: string) => string,
  webhookLabel: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of routines) {
    const binding = r.trigger;
    if (!binding) continue;
    out[r.id] =
      binding.kind === "webhook"
        ? webhookLabel
        : render(appName(binding.toolkit));
  }
  return out;
}

/** Poll cadence used while any trigger routine's status is still settling. */
export const TRIGGER_STATUS_POLL_MS = 15_000;

/**
 * How long a trigger routine may sit with NO status item before we stop showing
 * the indefinite "verifying" state and surface a concrete error instead. The
 * host normally reports a status within a couple of polls; past this window a
 * still-absent status means it almost certainly never provisioned (an older
 * host, a failed create), so the row should say so rather than spin forever.
 */
export const TRIGGER_STATUS_TIMEOUT_MS = 45_000;

/**
 * The trigger routines whose status has been ABSENT past the verification
 * timeout. Given each trigger routine's first-seen-without-status timestamp
 * (`firstSeenAt`), returns the ids that still have no status item and have gone
 * unanswered for at least `timeoutMs`. A routine that has any real status item
 * never times out (its status wins); one with no recorded first-seen (brand new
 * this render) waits for the next evaluation. Pure — the caller owns the clock.
 */
export function timedOutTriggerIds(
  triggerRoutineIds: string[],
  items: TriggerStatusItem[] | null | undefined,
  firstSeenAt: Record<string, number>,
  now: number,
  timeoutMs: number = TRIGGER_STATUS_TIMEOUT_MS,
): string[] {
  const known = new Set((items ?? []).map((i) => i.routine_id));
  return triggerRoutineIds.filter((id) => {
    if (known.has(id)) return false;
    const since = firstSeenAt[id];
    return since !== undefined && now - since >= timeoutMs;
  });
}

/**
 * Overlay a synthesized `error` status onto every timed-out trigger routine, so
 * its row/chip stop saying "verifying" forever. A real status item, when it
 * finally lands, is already in `base` and is never in `timedOutIds`, so it
 * always wins. Returns `base` untouched when nothing timed out.
 */
export function withTriggerTimeouts(
  base: Record<string, TriggerStatusItem>,
  timedOutIds: string[],
  detail: string,
): Record<string, TriggerStatusItem> {
  if (timedOutIds.length === 0) return base;
  const out = { ...base };
  for (const id of timedOutIds) {
    out[id] = { routine_id: id, status: "error", detail };
  }
  return out;
}

/**
 * Decide the trigger-status refetch cadence. Poll while any trigger routine is
 * still settling — no status item yet (the host is provisioning, or an older
 * host we are feature-detecting returned nothing), `pending`, or `error` — and
 * stop once every trigger routine has settled. A `paused_*` state waits on the
 * user (Reconnect), so it never keeps the poll alive. No trigger routines means
 * never poll.
 */
export function triggerStatusPollInterval(
  triggerRoutineIds: string[],
  items: TriggerStatusItem[] | null | undefined,
): number | false {
  if (triggerRoutineIds.length === 0) return false;
  const byId = new Map((items ?? []).map((i) => [i.routine_id, i.status]));
  const settling = triggerRoutineIds.some((id) => {
    const s = byId.get(id);
    return s === undefined || s === "pending" || s === "error";
  });
  return settling ? TRIGGER_STATUS_POLL_MS : false;
}

/**
 * The four things a trigger routine's activation chip can say, derived from its
 * live status: `checking` (no status yet, host still resolving), `activating`
 * (reconcile in flight), `active` (delivering), `alert` (needs the user —
 * disconnected, revoked, or errored). Missing status is `checking`, never a
 * silent blank.
 */
export type TriggerActivationKind =
  | "checking"
  | "activating"
  | "active"
  | "alert";

export function triggerActivationKind(
  status: TriggerStatusItem | undefined,
): TriggerActivationKind {
  switch (status?.status) {
    case undefined:
      return "checking";
    case "pending":
      return "activating";
    case "active":
      return "active";
    default:
      return "alert";
  }
}

/**
 * The webhook analog of {@link TriggerActivationKind}. It diverges on one state:
 * `pending` means the routine has no key minted yet, which is a call to action
 * ("Create webhook address"), NOT a system-side spinner — so it maps to
 * `needs_key` instead of `activating`. `checking` (no status yet), `active` (a
 * key exists, the address is live), and `alert` (any other server state) match.
 */
export type WebhookActivationState =
  | "checking"
  | "needs_key"
  | "active"
  | "alert";

export function webhookActivationState(
  status: TriggerStatusItem | undefined,
): WebhookActivationState {
  switch (status?.status) {
    case undefined:
      return "checking";
    case "pending":
      return "needs_key";
    case "active":
      return "active";
    default:
      return "alert";
  }
}
