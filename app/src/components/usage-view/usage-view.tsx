import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
} from "../../lib/providers";
import { useUIStore } from "../../stores/ui";
import { groupProviders } from "../provider-browser/provider-grouping";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { ComputeSection } from "./compute-section";
import { showComputeSection } from "./compute-usage-model";
import { UsagePane } from "./usage-pane";

/**
 * The top-level Usage page (sidebar "Usage", `viewMode "usage"`): each
 * connected AI account's live limits — rate-limit windows and prepaid
 * balances read from the providers' own usage APIs. The connected-account
 * set is derived exactly like the AI hub derives its Connected strip
 * (getConnectProviders + the shared connections layer), so the two surfaces
 * can never disagree about what "connected" means. The empty state's CTA
 * jumps to the AI Models hub, where connecting lives.
 */
export function UsageView() {
  const { t } = useTranslation("aiHub");
  const connections = useProviderConnections();
  const setViewMode = useUIStore((s) => s.setViewMode);

  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  const connectProviders = useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }),
    [newEngine, providerCapabilities],
  );
  const { connected } = useMemo(
    () => groupProviders(connectProviders, connections.isConnected),
    [connectProviders, connections.isConnected],
  );
  // Hosted cloud meters how long each agent's engine runs; only gateways that
  // serve the data advertise it. Mount-gating here also gates the query, so
  // desktop/self-host never fetch a route that doesn't exist.
  const showCompute = showComputeSection(capabilities);

  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="flex flex-col gap-6 py-10">
        <PageHeader
          title={t("usage.pageTitle")}
          subtitle={t("usage.pageSubtitle")}
        />
        {showCompute && <ComputeSection />}
        <UsagePane
          providers={connected}
          ready={connections.ready}
          onConnect={() => setViewMode("ai-hub")}
        />
      </PageContainer>
    </div>
  );
}
