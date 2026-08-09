import { CATALOG_PLANE_MAX_W, cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrationsFor,
  useCustomTransportAgentId,
} from "../../hooks/queries";
import {
  CustomIntegrationsSection,
  LoadingState,
  SigninState,
  UnavailableState,
  useConnectedApps,
  useIntegrationsGate,
} from "../integrations";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { PageContainer } from "../shell/page-shell";
import {
  customModeAvailable,
  INTEGRATIONS_HEADER_THRESHOLDS,
  IntegrationsHeader,
  type IntegrationsMode,
} from "./integrations-header";
import { IntegrationsReady } from "./integrations-ready";
import { useCatalogSurface } from "./use-catalog-surface";

/** The global personal Integrations surface, with identity outside every gate. */
export function IntegrationsView() {
  const { t } = useTranslation("integrations");
  const gate = useIntegrationsGate();
  const apps = useConnectedApps();
  const customTransportAgentId = useCustomTransportAgentId();
  const custom = useCustomIntegrationsFor(customTransportAgentId);
  const surface = useCatalogSurface({
    active: apps.activeRows,
    catalog: apps.catalogData,
    connections: apps.connData,
  });
  const hasCustomMode = customModeAvailable(custom.data, custom.isError);
  const active: IntegrationsMode =
    surface.tab === "custom" && hasCustomMode ? "custom" : "catalog";

  return (
    <PageHeaderToolsProvider thresholds={INTEGRATIONS_HEADER_THRESHOLDS}>
      <div className="flex h-full flex-col">
        <IntegrationsHeader
          active={active}
          onSelect={surface.setTab}
          customData={custom.data}
          customListFailed={custom.isError}
        />
        <div className="flex-1 overflow-auto">
          <PageContainer width="wide" className="pt-6 pb-10">
            {/* The catalog column caps at its own natural width (two capped
                cells) and centers in the wide page — headings and rows keep
                one shared left edge, and the page's margin absorbs the rest,
                split evenly, instead of piling up right of the grid. */}
            <div className={cn("mx-auto w-full", CATALOG_PLANE_MAX_W)}>
              {gate.kind === "ready" ? (
                <IntegrationsReady
                  reconnectNotice={gate.reconnectNotice}
                  dismissReconnect={gate.dismissReconnect}
                  mode={active}
                  apps={apps}
                  surface={surface}
                />
              ) : gate.kind === "loading" ? (
                <LoadingState />
              ) : gate.customAvailable && active === "custom" ? (
                <CustomIntegrationsSection variant="tab" />
              ) : gate.kind === "signin" ? (
                <SigninState
                  onSignIn={gate.signIn}
                  signingIn={gate.signingIn}
                />
              ) : gate.customAvailable ? (
                <p className="text-sm text-ink-muted">
                  {t("custom.catalogUnavailable")}
                </p>
              ) : (
                <UnavailableState />
              )}
            </div>
          </PageContainer>
        </div>
      </div>
    </PageHeaderToolsProvider>
  );
}
