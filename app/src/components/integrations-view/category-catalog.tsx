import { CatalogGrid, CatalogShowMore } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  appDisplay,
  browseCatalogView,
  CatalogLockedSection,
  type CatalogSection,
  type ConnectFlow,
  ConnectWaitingPanel,
  categoryLabel,
  groupCatalogByCategory,
  SECTION_PREVIEW_CAP,
  SectionHeader,
  UNCATEGORIZED,
} from "../integrations";
import { AppInfoDialog } from "./app-info-dialog";
import { PlaneAppRow } from "./plane-app-row";

/**
 * The browse plane: the full connectable catalog grouped into flat category
 * sections (the reference's "Featured / Productivity / Creativity" stacks),
 * replacing the old dropdown-filtered load-more grid. Grouping IS the
 * navigation, so there is no pagination and no category picker — every
 * connectable app is present, sorted into its section. Each section shows at
 * most {@link SECTION_PREVIEW_CAP} rows until the user expands it, so the first
 * paint stays bounded even over the ~1000-app catalog; every section expands
 * independently. An in-flight OAuth surfaces inline above the sections via the
 * shared waiting panel. A row BODY click opens the app's "more info" modal
 * ({@link AppInfoDialog}); only the row's `+` (or the modal's CTA) connects.
 * The connect flow lives on the SURFACE (`connectFlow`) so polling survives
 * re-renders; each row's `+` disables while ANOTHER connect owns the flow
 * (`busy`) and spins while it is the one connecting. On a Teams host with an
 * `allowlist` ceiling, apps outside it drop from the sections and surface as
 * read-only LOCKED rows below (same query + category filter, so searching a
 * blocked app finds its locked row, never a false empty state).
 */
export function CategoryCatalog({
  catalog,
  connections,
  connectFlow,
  query,
  category,
  allowlist = null,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  query: string;
  /** The filter dropdown's pick: a primary-category slug or "all". */
  category: string;
  /** The Teams effective allowlist (`null` = unrestricted, no locks ever). */
  allowlist?: string[] | null;
}) {
  const { t } = useTranslation("integrations");

  const bySlug = useMemo(
    () => new Map(catalog.map((tk) => [tk.slug, tk])),
    [catalog],
  );
  const connected = useMemo(
    () => new Set(connections.map((c) => c.toolkit)),
    [connections],
  );
  // The ceiling splits the browse set BEFORE grouping: sections hold only the
  // connectable apps; the blocked remainder renders as the locked strip below.
  const { connectable, locked } = useMemo(
    () => browseCatalogView({ catalog, query, category, connected, allowlist }),
    [catalog, query, category, connected, allowlist],
  );
  const sections: CatalogSection[] = useMemo(
    () =>
      groupCatalogByCategory({
        catalog: connectable,
        query,
        connected,
        category,
      }),
    [connectable, query, connected, category],
  );

  // The "more info" modal's subject — a row-body click sets it; `+` never does.
  const [infoToolkit, setInfoToolkit] = useState<IntegrationToolkit | null>(
    null,
  );
  // A fresh query resets every section back to its capped preview. Adjusting
  // state during render (React's documented pattern, mirroring AppCatalogGrid's
  // `shownFor`) keeps the reset in sync with the new query without a wasted paint.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [expandedForQuery, setExpandedForQuery] = useState(query);
  if (expandedForQuery !== query) {
    setExpandedForQuery(query);
    setExpanded(new Set());
  }

  const connecting = connectFlow.state;
  const connectingName = connecting
    ? appDisplay(connecting.toolkit, bySlug.get(connecting.toolkit)).name
    : "";

  return (
    <div>
      {connecting && (
        <div className="mb-6">
          <ConnectWaitingPanel
            appName={connectingName}
            connectFlow={connectFlow}
          />
        </div>
      )}

      {sections.length === 0 && locked.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          {t("picker.noResults")}
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => {
            const isExpanded = expanded.has(section.category);
            const rows = isExpanded
              ? section.connectable
              : section.connectable.slice(0, SECTION_PREVIEW_CAP);
            const hasMore =
              !isExpanded && section.connectable.length > SECTION_PREVIEW_CAP;
            return (
              <section key={section.category}>
                <SectionHeader
                  title={
                    section.category === UNCATEGORIZED
                      ? t("home.otherCategory")
                      : categoryLabel(section.category)
                  }
                  count={section.connectable.length}
                  className="mb-3"
                />
                <CatalogGrid>
                  {rows.map((tk) => (
                    <PlaneAppRow
                      key={tk.slug}
                      display={appDisplay(tk.slug, tk)}
                      onOpen={() => setInfoToolkit(tk)}
                      onConnect={() => void connectFlow.connect(tk.slug)}
                      connecting={connectFlow.state?.toolkit === tk.slug}
                      busy={connectFlow.state !== null}
                    />
                  ))}
                </CatalogGrid>
                {hasMore && (
                  <CatalogShowMore
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.add(section.category);
                        return next;
                      })
                    }
                  >
                    {t("home.showAllApps", {
                      count: section.connectable.length,
                    })}
                  </CatalogShowMore>
                )}
              </section>
            );
          })}
        </div>
      )}

      {locked.length > 0 && <CatalogLockedSection locked={locked} />}

      <AppInfoDialog
        toolkit={infoToolkit}
        onClose={() => setInfoToolkit(null)}
        onConnect={(toolkit) => {
          setInfoToolkit(null);
          void connectFlow.connect(toolkit);
        }}
        busy={connectFlow.state !== null}
      />
    </div>
  );
}
