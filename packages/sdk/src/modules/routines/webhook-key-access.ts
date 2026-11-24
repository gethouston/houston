import { refusalCode, refusalStatus } from "../refusal-code";

/**
 * Who may create or rotate a routine's incoming-webhook key. The gateway
 * answers the mint for the routine's recorded creator alone: a hook fires the
 * routine on its creator's credentials, and a rotation retires the creator's
 * live address, so no org role overrides it. A routine with no recorded
 * creator fires on the space's own credential, so only the space owner may
 * mint for it.
 *
 * This is the client half of that rule, judged on what every surface already
 * holds (the routine's `created_by`, the signed-in user, whether the viewer
 * owns the space), so a surface offers the action only when the gateway would
 * accept it. The gateway stays the enforcer: its `403 not_creator` is the
 * typed refusal below.
 *
 * Dependency-free and erasable-syntax-only: the app's node:test entry points
 * load it through the `@houston/sdk/routines/webhook-key-access` subpath.
 */
export interface WebhookKeyViewer {
  /** The routine's `created_by`; absent when it names no creator. */
  createdBy: string | undefined;
  /** The signed-in user's id; null or undefined while the session loads. */
  viewerId: string | null | undefined;
  /** Whether the viewer owns the space; undefined while that is unknown. */
  ownsSpace: boolean | undefined;
}

/**
 * `allowed`: the gateway would accept this viewer's mint. `not_creator`:
 * the routine names someone else, who alone may mint. `not_owner`: the
 * routine names no creator, so only the space owner may mint, and the viewer
 * is not the owner. `unknown`: the session or the space role has not loaded,
 * so a surface offers nothing yet rather than flash the wrong state. The two
 * refusals are told apart because a surface names who CAN mint, and that
 * person differs.
 */
export type WebhookKeyAccess =
  | "allowed"
  | "not_creator"
  | "not_owner"
  | "unknown";

export function webhookKeyAccess(viewer: WebhookKeyViewer): WebhookKeyAccess {
  if (viewer.createdBy) {
    if (!viewer.viewerId) return "unknown";
    return viewer.createdBy === viewer.viewerId ? "allowed" : "not_creator";
  }
  if (viewer.ownsSpace === undefined) return "unknown";
  return viewer.ownsSpace ? "allowed" : "not_owner";
}

/** The gateway's code for a mint by someone other than the routine's creator. */
export const WEBHOOK_KEY_NOT_CREATOR = "not_creator";

/**
 * Whether a failed mint or rotate was refused because the caller is not the
 * routine's creator (`403 not_creator`). An expected state with its own
 * authored copy, never a bug to report. Reads the adapter's parsed `body` or
 * the SDK's own error, whose message is the response text.
 */
export function isWebhookKeyNotCreatorRefusal(error: unknown): boolean {
  if (!(error instanceof Error) || refusalStatus(error) !== 403) return false;
  return refusalCode(error) === WEBHOOK_KEY_NOT_CREATOR;
}
