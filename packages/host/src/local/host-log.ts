import type { LocalHostOptions } from "./host-options";

export const LOCAL_USER = "local-owner";

/**
 * Log callback for the background daemons (store-sync, usage sampler): an
 * entry WITH an error is a failure → stderr, which the Sentry console capture
 * turns into an error event; an entry without one is operational logging →
 * info, a breadcrumb. Routing everything through console.error (the old shape)
 * made every "[store-sync] hydrated N objects" boot line a Sentry error issue.
 */
export function severityLog(message: string, err?: unknown): void {
  if (err === undefined) console.info(message);
  else console.error(message, err);
}

export function formatIntegrationsModeLog(
  integrations: LocalHostOptions["integrations"],
): string {
  if (integrations?.gatewayUrl) {
    return `[local-host] integrations: gateway ${integrations.gatewayUrl}`;
  }
  if (integrations?.composioApiKey) {
    return "[local-host] integrations: direct (own Composio key)";
  }
  return "[local-host] integrations off: set HOUSTON_INTEGRATIONS_URL or COMPOSIO_API_KEY to enable";
}
