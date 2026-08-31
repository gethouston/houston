import { CATALOG_PLANE_MAX_W, CatalogGrid, cn } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  AddCustomButton,
  CustomIntegrationRow,
  CustomSurfaceSupport,
  LoadingState,
  SigninState,
  UnavailableState,
  useConnectedApps,
  useCustomIntegrationsSurface,
  useIntegrationsGate,
} from "../integrations";
import { curatedToolkits } from "../integrations/curated-integrations";
import {
  PageHeaderTools,
  PageHeaderToolsProvider,
} from "../shell/page-header/page-header-tools";
import { PageContainer } from "../shell/page-shell";
import { tutorialAnchor } from "../tutorial";
import {
  INTEGRATIONS_HEADER_THRESHOLDS,
  IntegrationsHeader,
} from "./integrations-header";
import { IntegrationsReady } from "./integrations-ready";
import { useCatalogSurface } from "./use-catalog-surface";

/** The global personal Integrations surface, with identity outside every gate. */
export function IntegrationsView() {
  const { t } = useTranslation("integrations");
  const gate = useIntegrationsGate();
  const custom = useCustomIntegrationsSurface();
  // Curated entries (Croma…) join the browse catalog unless already added —
  // then their row lives in the Installed strip via the custom list instead.
  const curated = useMemo(
    () =>
      curatedToolkits(Array.isArray(custom.items) ? custom.items : [], (c) =>
        t(c.descriptionKey),
      ),
    [custom.items, t],
  );
  const apps = useConnectedApps(curated);
  const surface = useCatalogSurface({
    active: apps.activeRows,
    catalog: apps.catalogData,
    connections: apps.connData,
    custom: Array.isArray(custom.items) ? custom.items : [],
  });

  return (
    <PageHeaderToolsProvider thresholds={INTEGRATIONS_HEADER_THRESHOLDS}>
      <div className="flex h-full flex-col">
        <IntegrationsHeader />
        <div className="flex-1 overflow-auto">
          <PageContainer width="wide" className="pt-6 pb-10">
            {/* The catalog column caps at its own natural width (two capped
                cells) and centers in the wide page — headings and rows keep
                one shared left edge, and the page's margin absorbs the rest,
                split evenly, instead of piling up right of the grid. */}
            <div
              {...tutorialAnchor("integrationsCatalog")}
              className={cn("mx-auto w-full", CATALOG_PLANE_MAX_W)}
            >
              {gate.kind === "ready" ? (
                <IntegrationsReady
                  reconnectNotice={gate.reconnectNotice}
                  dismissReconnect={gate.dismissReconnect}
                  apps={apps}
                  surface={surface}
                  custom={custom}
                />
              ) : gate.kind === "loading" ? (
                <LoadingState />
              ) : (
                <>
                  {Array.isArray(custom.items) && (
                    <PageHeaderTools>
                      {(inStrip) => (
                        <AddCustomButton surface={custom} compact={inStrip} />
                      )}
                    </PageHeaderTools>
                  )}
                  {gate.kind === "signin" ? (
                    <SigninState
                      onSignIn={gate.signIn}
                      signingIn={gate.signingIn}
                    />
                  ) : Array.isArray(custom.items) ? (
                    // The catalog is off but custom integrations WORK right
                    // below — a flat "not available" over a working surface
                    // would be a lie (self-host without a Composio key).
                    <p className="text-sm text-ink-muted">
                      {t("custom.catalogUnavailable")}
                    </p>
                  ) : (
                    <UnavailableState />
                  )}
                  <CustomSurfaceSupport surface={custom} />
                  {Array.isArray(custom.items) && custom.items.length > 0 && (
                    <div className="mt-8">
                      <CatalogGrid>
                        {custom.items.map((item) => (
                          <CustomIntegrationRow
                            key={item.slug}
                            integration={item}
                            onOpen={(value) =>
                              custom.selection.openDetail(value.slug)
                            }
                            onEnterKey={(value) =>
                              custom.selection.openKey(value.slug)
                            }
                            onSignIn={(value) =>
                              custom.signIn.mutate(value.slug)
                            }
                            onRemove={(value) =>
                              custom.selection.openRemove(value.slug)
                            }
                          />
                        ))}
                      </CatalogGrid>
                    </div>
                  )}
                </>
              )}
            </div>
          </PageContainer>
        </div>
      </div>
    </PageHeaderToolsProvider>
  );
}
