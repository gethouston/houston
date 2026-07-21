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
  FEATURED,
  groupCatalogByCategory,
  type PermissionsFix,
  READY,
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
  lockedFix,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  query: string;
  /** The filter dropdown's pick: a primary-category slug or "all". */
  category: string;
  /** The Teams effective allowlist (`null` = unrestricted, no locks ever). */
  allowlist?: string[] | null;
  /** Role-aware "Enable it in Permissions" resolver for locked rows; absent =
   *  the read-only member view (ask-your-admin copy). */
  lockedFix?: PermissionsFix;
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
  // A fresh query OR category resets every section back to its capped preview
  // (changing category re-groups the sections, so a stale expansion no longer
  // maps). Adjusting state during render (React's documented pattern, mirroring
  // AppCatalogGrid's `shownFor`) keeps the reset in sync without a wasted paint.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const resetKey = JSON.stringify([query, category]);
  const [expandedForKey, setExpandedForKey] = useState(resetKey);
  if (expandedForKey !== resetKey) {
    setExpandedForKey(resetKey);
    setExpanded(new Set());
  }

  // This surface stays one-at-a-time: a live connect disables every other row
  // (`busy`), so at most one slug is ever in flight. Read the record as such —
  // the lone in-flight slug drives the shared waiting panel above the sections.
  const { states } = connectFlow;
  const busy = Object.keys(states).length > 0;
  const connectingSlug = Object.keys(states)[0] ?? null;
  const connectingName = connectingSlug
    ? appDisplay(connectingSlug, bySlug.get(connectingSlug)).name
    : "";

  return (
    <div>
      {connectingSlug && (
        <div className="mb-6">
          <ConnectWaitingPanel
            appName={connectingName}
            connectFlow={connectFlow}
            toolkit={connectingSlug}
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
                  // <h3>: nested under the Available section's lg <h2> heading.
                  as="h3"
                  title={
                    section.category === FEATURED
                      ? t("home.featured")
                      : section.category === READY
                        ? t("home.readyToUse")
                        : section.category === UNCATEGORIZED
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
                      connecting={tk.slug in states}
                      busy={busy}
                      ready={tk.noAuth === true}
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

      {locked.length > 0 && (
        <CatalogLockedSection locked={locked} onEnable={lockedFix} />
      )}

      <AppInfoDialog
        toolkit={infoToolkit}
        onClose={() => setInfoToolkit(null)}
        onConnect={(toolkit) => {
          setInfoToolkit(null);
          void connectFlow.connect(toolkit);
        }}
        busy={busy}
      />
    </div>
  );
}
