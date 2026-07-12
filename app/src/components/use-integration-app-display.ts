import { prettifyToolkit } from "@houston-ai/chat";
import { useIntegrationStatus, useIntegrationToolkits } from "../hooks/queries";
import {
  findCatalogToolkit,
  normalizeToolkitSlug,
} from "./integration-connect-card-state";
import {
  type AppDisplay,
  appDisplay,
  INTEGRATION_PROVIDER,
} from "./integrations";

/**
 * Resolve a toolkit slug to its display identity (name + logo) WITHOUT any
 * connect side effects — the read-only counterpart to `useIntegrationConnect`,
 * for a card that must SHOW an app's identity but never start OAuth (the
 * approval card). A prettified slug label on a catalog miss (never the raw
 * "gmail" string), and the logo held until the catalog settles so the
 * favicon-guess fallback never flashes a 404 (`AppLogo` shows the letter
 * meanwhile).
 */
export function useIntegrationAppDisplay(toolkit: string): AppDisplay {
  const status = useIntegrationStatus();
  const ready = !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)
    ?.ready;
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);
  const slug = normalizeToolkitSlug(toolkit);
  const resolved = appDisplay(slug, findCatalogToolkit(catalog.data, toolkit));
  return {
    ...resolved,
    name: resolved.name === slug ? prettifyToolkit(toolkit) : resolved.name,
    logoUrl: catalog.isFetched ? resolved.logoUrl : "",
  };
}
