import { CatalogGrid, CatalogShowMore } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  appDisplay,
  type CatalogSection,
  type ConnectFlow,
  ConnectWaitingPanel,
  categoryLabel,
  groupCatalogByCategory,
  SECTION_PREVIEW_CAP,
  SectionHeader,
  UNCATEGORIZED,
} from "../integrations";
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
 * shared waiting panel. The connect flow lives on the SURFACE (`connectFlow`) so
 * polling survives re-renders; each row disables while ANOTHER connect owns the
 * flow (`busy`) and spins while it is the one connecting.
 */
export function CategoryCatalog({
  catalog,
  connections,
  connectFlow,
  query,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  query: string;
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
  const sections: CatalogSection[] = useMemo(
    () => groupCatalogByCategory({ catalog, query, connected }),
    [catalog, query, connected],
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

      {sections.length === 0 ? (
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
                  className="mb-3"
                />
                <CatalogGrid>
                  {rows.map((tk) => (
                    <PlaneAppRow
                      key={tk.slug}
                      display={appDisplay(tk.slug, tk)}
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
    </div>
  );
}
