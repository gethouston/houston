import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import { useMemo, useState } from "react";
import {
  type BrokenConnection,
  browseCatalog,
  type CatalogSection,
  catalogHiddenToolkits,
  groupCatalogByCategory,
  inlineOwners,
  partitionConnections,
  SECTION_PREVIEW_CAP,
} from "../integrations";
import type { VisibleSection } from "./catalog-category-section";

export interface CatalogSections {
  visible: VisibleSection[];
  owners: Map<string, string>;
  broken: ReadonlyMap<string, BrokenConnection>;
  expand: (category: string) => void;
}

export function useCatalogSections(opts: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  query: string;
  category: string;
  surface: string;
  origins: Record<string, string>;
}): CatalogSections {
  const { catalog, connections, query, category, surface, origins } = opts;

  const hidden = useMemo(
    () => catalogHiddenToolkits(connections),
    [connections],
  );
  const broken = useMemo(
    () => partitionConnections(connections).broken,
    [connections],
  );
  const connectable = useMemo(
    () => browseCatalog({ catalog, query, category, connected: hidden }),
    [catalog, query, category, hidden],
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
    owners,
    broken,
    expand: (name) => setExpanded((prev) => new Set(prev).add(name)),
  };
}
