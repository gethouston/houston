import { Tabs, TabsList, TabsTrigger } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import { analytics } from "../../lib/analytics";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
} from "../../lib/providers";
import { useUIStore } from "../../stores/ui";
import { groupProviders } from "../provider-browser/provider-grouping";
import { BackBarScreen } from "../shell/back-bar-screen";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { ComputeSection } from "./compute-section";
import { showComputeSection } from "./compute-usage-model";
import { UsagePane } from "./usage-pane";

/**
 * The Usage screen (Settings > Usage): each connected AI account's live limits —
 * rate-limit windows and prepaid balances read from the providers' own usage
 * APIs. The connected-account set is derived exactly like the AI hub derives its
 * Connected strip (getConnectProviders + the shared connections layer), so the
 * two surfaces can never disagree about what "connected" means. The empty
 * state's CTA jumps to the AI Models hub, where connecting lives.
 *
 * A settings section since HOU-788 (it had its own sidebar entry before), so the
 * caller owns the way back: `onBack`/`backLabel` name the level above.
 */
type UsagePaneKey = "compute" | "models";

export function UsageView({
  backLabel,
  onBack,
}: {
  backLabel: string;
  onBack: () => void;
}) {
  const { t } = useTranslation("aiHub");
  const connections = useProviderConnections();
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [pane, setPaneState] = useState<UsagePaneKey>("compute");
  const setPane = (next: UsagePaneKey) => {
    setPaneState(next);
    analytics.track("tab_opened", { tab_name: `usage:${next}` });
  };

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
  // CONFIRMED connections only: a provider whose probe could not be confirmed
  // has no usage to show, and listing it here would render an account row with
  // nothing behind it (HOU-979).
  const { connected } = useMemo(
    () => groupProviders(connectProviders, connections.connectionState),
    [connectProviders, connections.connectionState],
  );
  // Hosted cloud meters how long each agent's engine runs; only gateways that
  // serve the data advertise it. Mount-gating here also gates the query, so
  // desktop/self-host never fetch a route that doesn't exist.
  const showCompute = showComputeSection(capabilities);

  return (
    <BackBarScreen backLabel={backLabel} onBack={onBack}>
      <PageContainer className="flex flex-col gap-6 pb-10">
        <PageHeader
          title={t("usage.pageTitle")}
          subtitle={t("usage.pageSubtitle")}
        />
        {/* The compute/models split only exists where the gateway meters
            compute; elsewhere the account sections stand alone, untoggled. */}
        {showCompute && (
          <Tabs value={pane} onValueChange={(v) => setPane(v as UsagePaneKey)}>
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:min-w-80 sm:self-start">
              <TabsTrigger value="compute">
                {t("usage.panes.compute")}
              </TabsTrigger>
              <TabsTrigger value="models">
                {t("usage.panes.models")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {showCompute && pane === "compute" ? (
          <ComputeSection />
        ) : (
          <UsagePane
            providers={connected}
            ready={connections.ready}
            onConnect={() => setViewMode("ai-hub")}
          />
        )}
      </PageContainer>
    </BackBarScreen>
  );
}
