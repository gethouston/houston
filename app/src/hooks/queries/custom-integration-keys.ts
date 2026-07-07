import { queryKeys } from "../../lib/query-keys.ts";

/**
 * Provider id for custom API-key integrations. Distinct from the composio
 * `INTEGRATION_PROVIDER` constant (which keeps naming composio-specific surfaces
 * like the app catalog); custom integrations are a second provider that runs in
 * the cloud gateway.
 */
export const CUSTOM_INTEGRATION_PROVIDER = "custom";

/**
 * Query keys to invalidate after a custom-integration create/update. Both must
 * refetch: the provider's connection list (a create/edit is a new/changed
 * connection) AND its toolkit catalog (for the custom provider the toolkits ARE
 * the caller's own integrations, so the catalog itself changes). Pure so it is
 * unit-testable without rendering the mutation hook.
 */
export function customIntegrationInvalidationKeys(): readonly (readonly string[])[] {
  return [
    queryKeys.integrationConnections(CUSTOM_INTEGRATION_PROVIDER),
    queryKeys.integrationToolkits(CUSTOM_INTEGRATION_PROVIDER),
  ];
}
