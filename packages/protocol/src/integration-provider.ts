export const INTEGRATION_PROVIDER_IDS = ["composio", "custom"] as const;

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDER_IDS)[number];
