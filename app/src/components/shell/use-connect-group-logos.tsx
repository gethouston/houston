import {
  SIDEBAR_CONNECT_LOGO_MAX,
  type SidebarConnectLogo,
} from "@houston-ai/layout";
import { useMemo } from "react";
import { useIntegrationConnections } from "../../hooks/queries";
import { useConnectedProviders } from "../../hooks/use-connected-providers";
import { connectedProviderIds } from "../../lib/connected-providers";
import { appDisplay } from "../integrations/app-display";
import { AppLogo } from "../integrations/app-logo";
import { curatedLogoUrl } from "../integrations/curated-logos";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import {
  useIntegrationProviderReady,
  useToolkitBySlug,
} from "../integrations/use-toolkit-catalog";
import { bundledConnectAppLogo } from "./connect-apps-bundled-logos";
import {
  CONNECT_AI_FALLBACK,
  pickConnectAppIds,
  pickConnectLogoIds,
} from "./connect-group-logos";
import { providerBrandColor } from "./provider-brand-colors";
import { providerBrandKey } from "./provider-logo-map";
import { ProviderGlyph } from "./provider-logos";

export function useConnectAppsLogos(): SidebarConnectLogo[] {
  const ready = useIntegrationProviderReady();
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const bySlug = useToolkitBySlug();
  return useMemo(() => {
    const connected = connections.data
      ?.filter((connection) => connection.status === "active")
      .map((connection) => connection.toolkit);
    const knownLogo = (slug: string) =>
      curatedLogoUrl(slug) || bySlug.get(slug)?.logoUrl || "";
    return pickConnectAppIds({
      connected: connected ?? null,
      knownLogo,
      max: SIDEBAR_CONNECT_LOGO_MAX,
    }).map((slug) => ({
      id: slug,
      element: (
        <AppLogo
          display={{
            ...appDisplay(slug, bySlug.get(slug)),
            logoUrl: bundledConnectAppLogo(slug) || knownLogo(slug),
          }}
          size="xs"
          className="rounded-none"
        />
      ),
    }));
  }, [connections.data, bySlug]);
}

function ProviderMark({ providerId }: { providerId: string }) {
  const color = providerBrandColor(providerId);
  return (
    <span className="flex text-ink" style={color ? { color } : undefined}>
      <ProviderGlyph providerId={providerId} className="size-full" />
    </span>
  );
}

export function useConnectAiLogos(): SidebarConnectLogo[] {
  const connected = connectedProviderIds(useConnectedProviders());
  return pickConnectLogoIds({
    connected,
    fallback: CONNECT_AI_FALLBACK,
    drawable: () => true,
    identity: (id) => providerBrandKey(id) ?? id,
    max: SIDEBAR_CONNECT_LOGO_MAX,
  }).map((id) => ({ id, element: <ProviderMark providerId={id} /> }));
}
