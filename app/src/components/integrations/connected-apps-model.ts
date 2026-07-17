import type { IntegrationConnection } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free derivations for the global Integrations page's connected-apps
 * read-model. Kept separate so the connection arithmetic is unit-tested in
 * isolation.
 */

/**
 * A connection key that is stable per ACCOUNT, not per app: a toolkit can hold
 * several accounts at once (e.g. an active login beside a leftover pending one),
 * so the connected-apps surfaces key by connection id and fall back to the
 * toolkit only when the host has not assigned an id yet.
 */
export function connKey(c: { connectionId: string; toolkit: string }): string {
  return c.connectionId || c.toolkit;
}

/**
 * Split connections into the two rows the page renders differently:
 *  - `active`     — usable apps, opened into the detail sheet for reconnect /
 *                   disconnect.
 *  - `recovering` — pending or errored connections, shown with the recovery
 *                   callout (finish / reconnect / remove) instead.
 * Input order is preserved within each bucket.
 */
interface ConnectionBuckets {
  active: IntegrationConnection[];
  recovering: IntegrationConnection[];
}

export function partitionConnections(
  connections: IntegrationConnection[],
): ConnectionBuckets {
  const active: IntegrationConnection[] = [];
  const recovering: IntegrationConnection[] = [];
  for (const connection of connections) {
    (connection.status === "active" ? active : recovering).push(connection);
  }
  return { active, recovering };
}
