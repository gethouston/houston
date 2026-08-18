import { shareErrorCode } from "./share-via-team.ts";

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
