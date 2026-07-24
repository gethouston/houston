import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  browseCatalogView,
  CatalogLockedSection,
  type CatalogSection,
  type ConnectFlow,
  groupCatalogByCategory,
  inlineOwners,
  type PermissionsFix,
  SECTION_PREVIEW_CAP,
} from "../integrations";
import { AppInfoDialog } from "./app-info-dialog";
import {
  CatalogCategorySection,
  type VisibleSection,
} from "./catalog-category-section";

/**
 * The browse plane: the full connectable catalog grouped into flat category
 * sections (the reference's "Featured / Productivity / Creativity" stacks),
 * replacing the old dropdown-filtered load-more grid. Grouping IS the
 * navigation, so there is no pagination and no category picker — every
 * connectable app is present, sorted into its section. Each section shows at
 * most {@link SECTION_PREVIEW_CAP} rows until the user expands it, so the first
 * paint stays bounded even over the ~1000-app catalog; every section expands
 * independently. A row BODY click opens the app's "more info" modal
 * ({@link AppInfoDialog}); only the row's `+` (or the modal's CTA) connects.
 *
 * An in-flight OAuth belongs to its OWN row ({@link PlaneAppRow} expands with
 * the live phase): there is no page-level waiting panel, so feedback never
 * appears 90px above whatever the user is reading, and no row is ever disabled
 * because a different app is connecting. Flows are per toolkit and concurrent;
 * the shared flow state (`connectFlow`) outlives this surface, so switching
 * tabs or leaving the page never kills a poll. The spotlight REPEATS rows that
 * also sit in a category section, so each row carries a
 * {@link connectOriginKey} and {@link inlineOwners} hands the expansion to the
 * single copy the user pressed — the duplicate keeps only its `+` spinner. On a
 * Teams host with an `allowlist` ceiling, apps outside it drop from the sections
 * and surface as read-only LOCKED rows below (same query + category filter, so
 * searching a blocked app finds its locked row, never a false empty state).
 */
export function CategoryCatalog({
  catalog,
  connections,
  connectFlow,
  surface,
  query,
  category,
  allowlist = null,
  lockedFix,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  /** This catalog's half of every row's origin key — which surface the row
   *  belongs to (the global page vs. one agent's tab). */
  surface: string;
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
  // It carries the row's origin so connecting from the modal lands its state on
  // the row the user opened, not on some other copy of the same app.
  const [info, setInfo] = useState<{
    toolkit: IntegrationToolkit;
    origin: string;
  } | null>(null);
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

  // The rows each section actually renders (capped until expanded), resolved
  // BEFORE the tree so the inline-state owner can be decided across sections.
  const visible: VisibleSection[] = useMemo(
    () =>
      sections.map((section) => {
        const isExpanded = expanded.has(section.category);
        return {
          category: section.category,
          total: section.connectable.length,
          rows: isExpanded
            ? section.connectable
            : section.connectable.slice(0, SECTION_PREVIEW_CAP),
          hasMore:
            !isExpanded && section.connectable.length > SECTION_PREVIEW_CAP,
        };
      }),
    [sections, expanded],
  );
  const owners = useMemo(
    () =>
      inlineOwners(
        visible.map((s) => ({
          section: s.category,
          slugs: s.rows.map((tk) => tk.slug),
        })),
        surface,
        connectFlow.origins,
      ),
    [visible, surface, connectFlow.origins],
  );

  return (
    <div>
      {sections.length === 0 && locked.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          {t("picker.noResults")}
        </p>
      ) : (
        <div className="space-y-8">
          {visible.map((section) => (
            <CatalogCategorySection
              key={section.category}
              section={section}
              surface={surface}
              connectFlow={connectFlow}
              // The spotlight repeats category rows: only the copy that owns
              // this app expands, so the panel appears exactly once.
              owns={(slug, origin) => owners.get(slug) === origin}
              onOpen={(toolkit, origin) => setInfo({ toolkit, origin })}
              onExpand={(category) =>
                setExpanded((prev) => new Set(prev).add(category))
              }
            />
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <CatalogLockedSection locked={locked} onEnable={lockedFix} />
      )}

      <AppInfoDialog
        toolkit={info?.toolkit ?? null}
        onClose={() => setInfo(null)}
        onConnect={(toolkit) => {
          const origin = info?.origin;
          setInfo(null);
          if (origin) void connectFlow.connect(toolkit, origin);
        }}
        // Gated on THIS app's own flow only: the modal's CTA must not go dead
        // because some other row is mid-OAuth. Live whenever the user opens the
        // modal for an app whose hand-off is already running (started from its
        // row, or from another surface entirely).
        busy={info !== null && info.toolkit.slug in connectFlow.states}
      />
    </div>
  );
}
