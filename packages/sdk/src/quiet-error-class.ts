/**
 * The quiet failure classes of every client's error-surfacing layer, and the
 * one rule for collapsing their bursts. A quiet class is an expected
 * environment state (the device offline, an agent's pod waking, a bridge
 * state the SDK names in `local-model-bridge/quiet`) that the person sees as
 * ONE informational notice,
 * never a bug report, while the raw diagnostic still reaches Sentry as a
 * warning under a FIXED fingerprint per class (PRODUCT-1640): each class is
 * one issue with a count and searchable bodies, and a deploy roll can never
 * file new issues.
 *
 * The classifiers that NAME a class read transport and gateway shapes, so
 * they live in the engine adapter and the shells; this module holds only the
 * vocabulary and the collapse rule they share, so every surface (desktop, web,
 * iOS over the bridge) reports one episode the same way. Dependency-free and
 * erasable-syntax-only: the app's node:test entry points load it through the
 * `@houston/sdk/quiet-error-class` subpath, so the one import below is a
 * package self-reference (node resolves no extensionless relative import).
 */

import type { BridgeQuietClass } from "@houston/sdk/local-model-bridge/quiet";

/** Doubles as the Sentry fingerprint, so the value is the issue's identity.
 *  `release_host_unavailable` is the updater's release host answering a
 *  transient status for its whole retry budget (PRODUCT-1811); it is only
 *  ever named by the download report path, never by a classifier. */
export type QuietErrorClass =
  | "engine_waking"
  | "offline"
  | BridgeQuietClass
  | "release_host_unavailable"
  | "no_url_handler";

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
