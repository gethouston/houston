/**
 * The quiet failure classes of every client's error-surfacing layer, and the
 * one rule for collapsing their bursts. A quiet class is an expected
 * environment state (the device offline, an agent's pod waking, a bridge
 * state the SDK names in `local-model-bridge/quiet`) that the person sees as
 * ONE informational notice, never a bug report, while the raw diagnostic still
 * reaches Sentry as a warning under a FIXED fingerprint per class
 * (PRODUCT-1640): each class is one issue with a count and searchable bodies,
 * and a deploy roll can never file new issues.
 *
 * The classifiers that NAME a class read transport and gateway shapes, so they
 * live in the engine adapter and the app; this module holds only the vocabulary
 * and the collapse rule they share, so every surface (desktop, web) reports one
 * episode the same way. Dependency-free and erasable-syntax-only: the app's
 * node:test entry points load this module through the
 * `@houston/sdk/quiet-error-class` subpath, so the one import below is a
 * package self-reference (node resolves no extensionless relative import).
 */

import type { BridgeQuietClass } from "@houston/sdk/local-model-bridge/quiet";

/** Doubles as the Sentry fingerprint, so the value is the issue's identity.
 *  `plan_min_interval` is a routine save refused under the saver's plan floor
 *  (`@houston/sdk/routines/plan-floor-quiet`): a business state with its own
 *  plan copy, which every reporting path skips outright (nothing to triage).
 *  `release_host_unavailable` is the updater's release host answering a
 *  transient status for its whole retry budget (PRODUCT-1811); it is only
 *  ever named by the download report path, never by a classifier.
 *  `webhook_not_creator` is a webhook-key mint or rotate the gateway refused
 *  because the caller is not the routine's creator
 *  (`@houston/sdk/routines/webhook-key-access`): an expected state with its
 *  own copy, which every reporting path skips outright.
 *  `first_day_no_provider` is a first-day start refused because the person
 *  has no AI connected (`@houston/sdk/agents/first-day-refusal`): an expected
 *  state whose surface offers the connect flow, skipped by every reporting
 *  path.
 *  `storage_full` is the device's disk refusing the updater's release
 *  download: the device's state, not a bug, named only by the download report
 *  path and never retried for that release in the session.
 *  `bug_intake_unavailable` is the bug-report intake (Linear) refusing every
 *  report on our side, its plan's issue cap above all (HOUSTON-APP-5FT): the
 *  report itself still arrives through the fallback feedback, so the refusal
 *  is one counted warning, never a per-user bug.
 *  `upload_interrupted` is an upload the transport cut before any answer
 *  (`files/upload-interrupted`): a person's action, so it gets copy naming
 *  the upload rather than the offline notice, and its own issue so a proxy
 *  cutting slow uploads is never hidden among network drops again.
 *  `routine_gone` is a routine write or run-now whose routine no longer
 *  exists (`routines/routine-gone`): deleted elsewhere, or a list served
 *  from a stale mirror. An expected state with its own copy, but unlike the
 *  plan floor it still reports ONE fingerprinted warning: a burst of them
 *  means a stale mirror, which is our bug.
 *  `link_identity_taken` is a provider sign-in that met an existing account
 *  whose provider identity already belongs to another account
 *  (`modules/identity`): the person stays signed in by email code and sees
 *  a notice. Support can join the accounts, so it is one counted warning. */
export type QuietErrorClass =
  | "engine_waking"
  | "offline"
  | BridgeQuietClass
  | "release_host_unavailable"
  | "storage_full"
  | "no_url_handler"
  | "plan_min_interval"
  | "webhook_not_creator"
  | "first_day_no_provider"
  | "bug_intake_unavailable"
  | "upload_interrupted"
  | "routine_gone"
  | "link_identity_taken";

/**
 * The burst-gate key a quiet-class report collapses on.
 *
 * A transport drop (`offline`) fails EVERY live query on the device at once,
 * and each one reaches the report path carrying the same message and no
 * status: keyed per command, one sleep-wake filed a dozen events in the same
 * second (HOUSTON-APP-5CG, PRODUCT-1825), inflating the fixed issue against
 * the Sentry quota while saying nothing the first event did not. So `offline`
 * keys on the class alone: one episode, one event, whose `source` tag is the
 * command that lost first. Every other class keeps (class, command, agent):
 * a waking answer is per agent and feeds the per-agent stuck-wake tracker.
 */
export function quietBurstKey(
  kind: QuietErrorClass,
  command: string,
  agent: string | null,
): string {
  if (kind === "offline") return kind;
  return `${kind}:${command}:${agent ?? ""}`;
}
