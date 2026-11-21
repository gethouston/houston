import { CATALOG_PLANE_MAX_W, CatalogGrid, cn } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { claimSignInTab, useIntegrationToolkits } from "../../hooks/queries";
import {
  AddCustomButton,
  CustomIntegrationRow,
  CustomScopeControl,
  CustomSurfaceSupport,
  INTEGRATION_PROVIDER,
  LoadingState,
  SigninState,
  UnavailableState,
  useConnectedApps,
  useCustomIntegrationsSurface,
  useIntegrationsGate,
} from "../integrations";
import {
  curatedToolkits,
  withoutAddedCurated,
} from "../integrations/curated-integrations";
import { curatedLogoUrl } from "../integrations/curated-logos";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { PageContainer } from "../shell/page-shell";
import { IntegrationsReady } from "./integrations-ready";
import { useCatalogSurface } from "./use-catalog-surface";

export function CatalogTab() {
  const { t } = useTranslation("integrations");
  const gate = useIntegrationsGate();
  const custom = useCustomIntegrationsSurface();
  const customItems = useMemo(
    () => (Array.isArray(custom.items) ? custom.items : []),
    [custom.items],
  );
  const providerCatalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const curated = useMemo(
    () =>
      curatedToolkits(
        customItems,
        (c) => t(c.descriptionKey),
        curatedLogoUrl,
        providerCatalog.data ?? [],
      ),
    [customItems, providerCatalog.data, t],
  );
  const merged = useConnectedApps(curated);
  const apps = useMemo(
    () => ({
      ...merged,
      catalogData: withoutAddedCurated(merged.catalogData, customItems),
    }),
    [merged, customItems],
  );
  const surface = useCatalogSurface({
    active: apps.activeRows,
    catalog: apps.catalogData,
    connections: apps.connData,
    custom: customItems,
  });

  return (
    <div
      data-integrations-section="catalog"
      className="flex-1 overflow-auto [scrollbar-gutter:stable]"
    >
      <PageContainer width="wide" className="pt-6 pb-10">
        <div className={cn("mx-auto w-full", CATALOG_PLANE_MAX_W)}>
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
                    <>
                      <CustomScopeControl surface={custom} compact={inStrip} />
                      <AddCustomButton surface={custom} compact={inStrip} />
                    </>
                  )}
                </PageHeaderTools>
              )}
              {gate.kind === "signin" ? (
                <SigninState
                  onSignIn={gate.signIn}
                  signingIn={gate.signingIn}
                />
              ) : Array.isArray(custom.items) ? (
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
                          custom.signIn.mutate({
                            slug: value.slug,
                            tab: claimSignInTab(),
                          })
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
  );
}
