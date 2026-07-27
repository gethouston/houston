import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import {
  type BrokenConnection,
  browseCatalogView,
  type CatalogSection,
  catalogHiddenToolkits,
  groupCatalogByCategory,
  inlineOwners,
  partitionConnections,
  SECTION_PREVIEW_CAP,
} from "../integrations";
import type { VisibleSection } from "./catalog-category-section";

/** Everything the browse plane renders, derived once from the raw catalog +
 *  connections so the view stays a thin tree over these values. */
export interface CatalogSections {
  /** The category sections on screen, each capped until the user expands it. */
  visible: VisibleSection[];
  /** Apps a Teams ceiling blocks, shown as read-only locked rows below. */
  locked: IntegrationToolkit[];
  /** slug -> the origin key of the ONE rendered row that owns its inline
   *  connect state (the spotlight repeats rows; only one may expand). */
  owners: Map<string, string>;
  /** toolkit -> its pending / errored connection, for the rows that hold one. */
  broken: ReadonlyMap<string, BrokenConnection>;
  /** Drop one section's preview cap. */
  expand: (category: string) => void;
}

/**
 * The browse plane's derivation, lifted out of the view: which apps are
 * connectable (a WORKING connection has left for the Installed strip, an
 * admin-blocked one for the "Not allowed" section — a broken connection stays
 * right here), how they group into capped category sections, which single copy
 * of a repeated app owns the live connect state, and which apps wear a broken
 * connection's status.
 *
 * A fresh query OR category resets every section back to its capped preview
 * (changing category re-groups the sections, so a stale expansion no longer
 * maps). Adjusting state during render is React's documented pattern and keeps
 * the reset in sync without a wasted paint.
 */
export function useCatalogSections(opts: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  query: string;
  category: string;
  allowlist: string[] | null;
  /** This catalog's half of every row's origin key. */
  surface: string;
  /** slug -> the origin key the live flow was started from. */
  origins: Record<string, string>;
}): CatalogSections {
  const { catalog, connections, query, category, allowlist, surface, origins } =
    opts;

  const hidden = useMemo(
    () => catalogHiddenToolkits(connections, allowlist),
    [connections, allowlist],
  );
  const broken = useMemo(
    () => partitionConnections(connections).broken,
    [connections],
  );
  // The ceiling splits the browse set BEFORE grouping: sections hold only the
  // connectable apps; the blocked remainder renders as the locked strip below.
  const { connectable, locked } = useMemo(
    () =>
      browseCatalogView({
        catalog,
        query,
        category,
        connected: hidden,
        allowlist,
      }),
    [catalog, query, category, hidden, allowlist],
  );
  const sections: CatalogSection[] = useMemo(
    () =>
      groupCatalogByCategory({
        catalog: connectable,
        query,
        connected: hidden,
        category,
      }),
    [connectable, query, hidden, category],
  );

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
        origins,
      ),
    [visible, surface, origins],
  );

  return {
    visible,
    locked,
    owners,
    broken,
    expand: (name) => setExpanded((prev) => new Set(prev).add(name)),
  };
}
