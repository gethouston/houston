import type { AgentConfig } from "@houston/protocol";

/**
 * The config rules that keep an AI Employee's first day one-way: born pending
 * with the agent (its create's seeds carry the config document), then moved
 * to started only by the host's start. Import-free, so the e2e fake host can
 * load it the way the real host does.
 */

/** The config document's seed key, relative to the agent root: `docKey`'s
 *  `.houston/config/config.json` layout. */
export const CONFIG_SEED_KEY = ".houston/config/config.json";

/** The config fields the host owns once the agent exists: written with the
 *  create, then only by the host's first-day start. */
const HOST_OWNED_CONFIG_FIELDS = ["firstDay", "arrival"] as const;

/**
 * A config write as the host stores it: the first-day fields keep what the
 * stored config holds, whatever the incoming document says. A surface writes
 * the whole config after reading it, so a read taken before the first day
 * started (or before the pod's seed landed) would otherwise put the start
 * button back, or take it away for good. Answers `incoming` itself when it
 * already agrees, so the caller can store the document as it was sent.
 */
export function keepHostOwnedConfig(
  incoming: Record<string, unknown>,
  stored: AgentConfig,
): Record<string, unknown> {
  const agrees = HOST_OWNED_CONFIG_FIELDS.every(
    (field) => incoming[field] === stored[field],
  );
  if (agrees) return incoming;
  const next: Record<string, unknown> = { ...incoming };
  for (const field of HOST_OWNED_CONFIG_FIELDS) {
    if (stored[field] === undefined) delete next[field];
    else next[field] = stored[field];
  }
  return next;
}
