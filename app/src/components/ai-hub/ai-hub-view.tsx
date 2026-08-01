import {
  CatalogSearchField,
  CatalogShell,
  type CatalogShellTab,
  cn,
} from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types";
import { searchModels } from "../../lib/ai-hub/search";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import type { ProviderInfo } from "../../lib/providers";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageContainer } from "../shell/page-shell";
import { ConnectedProvidersStrip } from "./connected-providers-strip";
import { HubHero } from "./hub-hero";
import { HubModalStack } from "./hub-modal-stack";
import { HubSkeleton } from "./hub-skeleton";
import { ModelDirectory } from "./model-directory";
import { ProvidersPane } from "./providers-pane";
import { useHubProviders } from "./use-hub-providers";

/**
 * The AI models hub: a top-level marketplace surface in the shared
 * {@link CatalogShell} grammar (the same layout as the Integrations page) —
 * the hero, the "Your accounts" note in a team space (HOU-976: an agent there
 * runs on the AI account of whoever messages it, so every member connects their
 * own here), then ONE
 * search field over everything, the consolidated **Connected** strip of provider
 * rows OUTSIDE the tabs (a row opens that provider's modal), then the
 * **Available** discovery tabs with live count chips: **Providers**
 * ({@link ProvidersPane}: the not-yet-connected catalog) and **Models** (the
 * cross-provider directory). The one query narrows the Connected strip and both
 * tabs' content at once.
 * A provider row or model row opens a centered MODAL (`ProviderModal` /
 * `ModelModal`); the connect-dialog stack renders once here for every surface
 * underneath. (Workspace model policy lives on the Admin page.)
 */
export function AiHubView() {
  const { t } = useTranslation("aiHub");
  const { catalog, isLoading } = useHubCatalog();
  const connections = useProviderConnections();
  const [tab, setTab] = useState("providers");
  // The page's ONE search field, above everything: it narrows the Connected
  // strip AND both discovery tabs' content.
  const [query, setQuery] = useState("");
  const [openProvider, setOpenProvider] = useState<ProviderInfo | null>(null);
  const [openModel, setOpenModel] = useState<CatalogModel | null>(null);

  const { available, owned, connectedMatches, availableMatches, searching } =
    useHubProviders(connections, query);

  // In a TEAM space the accounts on this page are the viewer's OWN: an agent
  // runs every turn on the AI account of the person who messaged it. Saying so
  // once, above the catalog, is what keeps a member from reading these rows as
  // the team's shared connections. A personal space has one account and nothing
  // to qualify, so it renders no note at all and looks exactly as it shipped.
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const teamSpace = isTeamWorkspace(workspaceId ?? "");

  // Models tab chip: models matching the page query (facets narrow further).
  const modelMatches = useMemo(
    () => (catalog ? searchModels(catalog.models, query) : []),
    [catalog, query],
  );

  // While a modal is up, freeze the page scroller behind it. Radix's scroll
  // lock only locks <body>; this inner region kept its own live scrollbar,
  // which sat next to the modal's as a second, draggable vertical scroll.
  // Hidden boxes are still scroll containers, so `scrollbar-gutter: stable`
  // keeps the gutter reserved and the scroll offset holds.
  const modalOpen = openProvider !== null || openModel !== null;

  const tabs: CatalogShellTab[] | null = catalog
    ? [
        {
          value: "providers",
          label: t("tabs.providers"),
          count: connections.ready
            ? searching
              ? availableMatches.length
              : available.length
            : undefined,
          content: (
            <ProvidersPane
              providers={available}
              query={query}
              connections={connections}
              catalog={catalog}
              onOpen={setOpenProvider}
            />
          ),
        },
        {
          value: "models",
          label: t("tabs.models"),
          count: searching ? modelMatches.length : catalog.modelCount,
          content: (
            <ModelDirectory
              catalog={catalog}
              query={query}
              onOpenModel={(key) => {
                const model = catalog.byKey.get(key);
                if (model) setOpenModel(model);
              }}
            />
          ),
        },
      ]
    : null;

  return (
    <div
      className={cn(
        "h-full [scrollbar-gutter:stable]",
        modalOpen ? "overflow-y-hidden" : "overflow-y-auto",
      )}
    >
      <PageContainer className="flex flex-col gap-6 py-10">
        {!catalog || !tabs ? (
          <HubSkeleton loading={isLoading} />
        ) : (
          <>
            <HubHero modelCount={catalog.modelCount} />
            {teamSpace && (
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium text-ink">
                  {t("accounts.title")}
                </h2>
                <p className="text-sm text-ink-muted">
                  {t("accounts.description")}
                </p>
              </div>
            )}
            <CatalogShell
              controls={
                <CatalogSearchField
                  value={query}
                  onChange={setQuery}
                  label={t("search.placeholder")}
                  clearLabel={t("search.clear")}
                />
              }
              installedTitle={t("sections.connected")}
              installedCount={
                connections.ready
                  ? searching
                    ? connectedMatches.length
                    : owned.length
                  : undefined
              }
              availableTitle={t("sections.available")}
              installed={
                connections.ready && connectedMatches.length > 0 ? (
                  <ConnectedProvidersStrip
                    providers={connectedMatches}
                    connectionState={connections.connectionState}
                    searching={searching}
                    onOpen={setOpenProvider}
                  />
                ) : undefined
              }
              tabs={tabs}
              value={tab}
              onValueChange={setTab}
            />
          </>
        )}
      </PageContainer>

      {catalog && (
        <HubModalStack
          catalog={catalog}
          connections={connections}
          openProvider={openProvider}
          setOpenProvider={setOpenProvider}
          openModel={openModel}
          setOpenModel={setOpenModel}
        />
      )}
    </div>
  );
}
