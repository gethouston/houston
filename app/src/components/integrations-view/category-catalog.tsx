import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CatalogLockedSection,
  type ConnectFlow,
  type PermissionsFix,
} from "../integrations";
import { AppInfoDialog } from "./app-info-dialog";
import { CatalogCategorySection } from "./catalog-category-section";
import { useCatalogSections } from "./use-catalog-sections";

/**
 * The browse plane: the full connectable catalog grouped into flat category
 * sections (the reference's "Featured / Productivity / Creativity" stacks),
 * replacing the old dropdown-filtered load-more grid. Grouping IS the
 * navigation, so there is no pagination and no category picker — every
 * connectable app is present, sorted into its section. Each section shows a
 * capped preview until the user expands it, so the first paint stays bounded
 * even over the ~1000-app catalog; every section expands independently. A row
 * BODY click opens the app's "more info" modal ({@link AppInfoDialog}); only
 * the row's `+` (or the modal's CTA) connects.
 *
 * An app whose connection is pending or errored is NOT pulled out of here:
 * only a WORKING connection leaves the catalog (for the Installed strip), so a
 * failed connect leaves the app exactly where the user pressed it, wearing its
 * status and retrying from its own `+`. Its modal is the one place the
 * connection can be removed.
 *
 * An in-flight OAuth belongs to its OWN row (the row expands with the live
 * phase): there is no page-level waiting panel, so feedback never appears 90px
 * above whatever the user is reading, and no row is ever disabled because a
 * different app is connecting. Flows are per toolkit and concurrent; the shared
 * flow state (`connectFlow`) outlives this surface, so switching tabs or leaving
 * the page never kills a poll. The spotlight REPEATS rows that also sit in a
 * category section, so each row carries an origin key and `useCatalogSections`
 * hands the expansion to the single copy the user pressed — the duplicate keeps
 * only its `+` spinner. On a
 * Teams host with an `allowlist` ceiling, apps outside it drop from the sections
 * and surface as read-only LOCKED rows below (same query + category filter, so
 * searching a blocked app finds its locked row, never a false empty state).
 */
export function CategoryCatalog({
  catalog,
  connections,
  connectFlow,
  onConnected,
  surface,
  query,
  category,
  onRemove,
  allowlist = null,
  lockedFix,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  onConnected?: (toolkit: string) => void;
  /** This catalog's half of every row's origin key — which surface the row
   *  belongs to (the global page vs. one agent's tab). */
  surface: string;
  query: string;
  /** The filter dropdown's pick: a primary-category slug or "all". */
  category: string;
  /** Disconnect a broken connection (the modal's Remove). */
  onRemove: (toolkit: string) => void;
  /** The Teams effective allowlist (`null` = unrestricted, no locks ever). */
  allowlist?: string[] | null;
  /** Role-aware "Enable it in Permissions" resolver for locked rows; absent =
   *  the read-only member view (ask-your-admin copy). */
  lockedFix?: PermissionsFix;
}) {
  const { t } = useTranslation("integrations");
  const { visible, locked, owners, broken, expand } = useCatalogSections({
    catalog,
    connections,
    query,
    category,
    allowlist,
    surface,
    origins: connectFlow.origins,
  });

  // The "more info" modal's subject — a row-body click sets it; `+` never does.
  // It carries the row's origin so connecting from the modal lands its state on
  // the row the user opened, not on some other copy of the same app.
  const [info, setInfo] = useState<{
    toolkit: IntegrationToolkit;
    origin: string;
  } | null>(null);

  return (
    <div>
      {visible.length === 0 && locked.length === 0 ? (
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
              onConnected={onConnected}
              // The spotlight repeats category rows: only the copy that owns
              // this app expands, so the panel appears exactly once.
              owns={(slug, origin) => owners.get(slug) === origin}
              statusOf={(slug) => broken.get(slug)?.status}
              onOpen={(toolkit, origin) => setInfo({ toolkit, origin })}
              onExpand={expand}
            />
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <CatalogLockedSection locked={locked} onEnable={lockedFix} />
      )}

      <AppInfoDialog
        toolkit={info?.toolkit ?? null}
        broken={info ? broken.get(info.toolkit.slug) : undefined}
        onClose={() => setInfo(null)}
        onConnect={(toolkit) => {
          const origin = info?.origin;
          setInfo(null);
          if (origin) {
            void connectFlow.connect(toolkit, origin).then((attempt) => {
              if (attempt.outcome === "active") onConnected?.(toolkit);
            });
          }
        }}
        onRemove={(toolkit) => {
          setInfo(null);
          onRemove(toolkit);
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
