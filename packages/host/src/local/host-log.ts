import type { LocalHostOptions } from "./host-options";

export const LOCAL_USER = "local-owner";

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
