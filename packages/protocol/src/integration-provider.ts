/**
 * The integration providers a deployment can register.
 *
 * A CLOSED set, unlike `ProviderId` (the AI providers, whose pi-ai catalog
 * drifts): an integration provider is a Houston-side adapter, so it exists only
 * if this repo ships one. Both live implementations are in the host —
 * `integrations/composio.ts` (`id = "composio"`) and
 * `integrations/custom/provider.ts` (`id = "custom"`) — and they are what
 * `IntegrationRegistry` is built from
 * (`packages/host/src/integrations/registry.ts`).
 *
 * It lives in the protocol so the client surface and the host name the same two
 * values: the `/v1/integrations/{provider}/…` routes take one of these in a path
 * segment, and a caller that has to guess the segment guesses wrong.
 */
export const INTEGRATION_PROVIDER_IDS = ["composio", "custom"] as const;

/** One registered integration provider's id. */
export type IntegrationProviderId = (typeof INTEGRATION_PROVIDER_IDS)[number];
