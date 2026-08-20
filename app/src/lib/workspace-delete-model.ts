import type { BillingSummary, OrgMember } from "@houston-ai/engine-client";
import { shareErrorCode } from "./share-via-team.ts";
import type { Workspace } from "./types.ts";

/**
 * Pure, DOM-free logic behind deleting a team space from Settings → Danger
 * Zone (`DELETE /v1/orgs/:slug`, PRODUCT-1410). Kept out of the `.tsx` so the
 * error taxonomy unit-tests under bare Node, exactly like `invite-model.ts`.
 *
 * The gateway is the sole enforcer: this module only decides what the owner is
 * TOLD when the call comes back, never who may delete.
 */

/**
 * The gateway rejections the Danger Zone explains itself:
 *
 * - `has_members` (409) — teammates are still in the space. Deleting would
 *   destroy their agents under them; the owner removes them (or they leave)
 *   first, then deletes.
 * - `subscription_active` (409) — the team still carries a live subscription.
 *   The owner cancels it from Billing first, so a delete can never leave a
 *   paying subscription behind with nothing under it.
 * - `personal_space` (403) — a personal space is never deletable on its own
 *   (it goes with the account). The UI never offers it; a stale switcher can.
 * - `unknown` — anything else, which keeps the standard red bug toast.
 */
export type WorkspaceDeleteFailure =
  | "has_members"
  | "subscription_active"
  | "personal_space"
  | "unknown";

const EXPECTED_DELETE_CODES = new Set<WorkspaceDeleteFailure>([
  "has_members",
  "subscription_active",
  "personal_space",
]);

/** Classify a delete rejection into {@link WorkspaceDeleteFailure}. */
export function classifyWorkspaceDeleteError(
  err: unknown,
): WorkspaceDeleteFailure {
  const code = shareErrorCode(err);
  return code !== undefined &&
    EXPECTED_DELETE_CODES.has(code as WorkspaceDeleteFailure)
    ? (code as WorkspaceDeleteFailure)
    : "unknown";
}

/**
 * True for a rejection the Danger Zone explains with its own plain
 * informational toast. `call()` silences these (no red bug toast, no Sentry
 * report) so each one gets exactly ONE surface; every other failure keeps the
 * standard toast + report path.
 */
export function isExpectedWorkspaceDeleteError(err: unknown): boolean {
  return classifyWorkspaceDeleteError(err) !== "unknown";
}

/**
 * Can the Danger Zone assume the gateway will accept the delete, and so switch
 * the user away with a success toast BEFORE the server round-trip
 * (PRODUCT-1426)? This decides the UX shape only, never the outcome — the
 * gateway stays the sole enforcer, so a false `false` merely means the slower
 * server-first flow, while a false `true` is caught by the store's rollback.
 *
 * Mirrors the gateway's two 409s over fresh reads of the ACTIVE space (the
 * one being deleted) — NOT the `GET /v1/orgs` summaries, which carry no
 * billing detail:
 * - `has_members` rejects when any OTHER member row exists. `GET /v1/org`'s
 *   roster is the very same member listing the delete handler counts, and the
 *   caller (the owner) is always one row → require `members.length <= 1`. An
 *   absent roster is unverifiable → never optimistic.
 * - `subscription_active` rejects when a Stripe subscription object exists in
 *   a non-terminal state. `GET /v1/org/billing` degrades to `null` exactly
 *   when the billing surface is OFF (unconfigured / predates the route) — no
 *   Stripe object can exist there, so `null` is SAFE. On a real summary,
 *   `interval` is set exactly when a Stripe object exists, and the effective
 *   status can hide one (a solo team with a trialing/unpaid Stripe object
 *   reads `free`), so require no `interval` AND a status that is not
 *   `active`/`past_due`. `enterprise` bills off-platform — unverifiable.
 */
export function canDeleteOptimistically(
  members: readonly OrgMember[] | undefined,
  billing: BillingSummary | null,
): boolean {
  if (members === undefined || members.length > 1) return false;
  if (billing === null) return true;
  if (billing.plan !== "team") return false;
  return (
    billing.status !== "active" &&
    billing.status !== "past_due" &&
    billing.interval === undefined
  );
}

/**
 * Put a row back where it was after an optimistic delete the server rejected
 * (PRODUCT-1426). Dedupes by id: a background re-list racing the rollback may
 * already have restored the row, and it wins — its object is fresher.
 */
export function restoreSpaceRow(
  list: Workspace[],
  row: Workspace,
  index: number,
): Workspace[] {
  if (list.some((w) => w.id === row.id)) return list;
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), row, ...list.slice(at)];
}
