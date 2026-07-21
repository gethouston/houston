import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import {
  type FilteredInstalled,
  filterInstalledBy,
  type InstalledRow,
} from "../../lib/installed-preview";
import { browseCatalogView } from "../integrations";

/** The consolidated catalog surface's shared view state, ready for
 *  {@link CatalogShell}. */
export interface CatalogSurface {
  tab: string;
  setTab: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  /** True while the shared query or category is narrowing both sections — the
   *  cue to uncap the Installed preview. */
  filtering: boolean;
  /** The installed rows narrowed by the shared filter, fed to `InstalledStrip`. */
  shown: FilteredInstalled;
  /** How many installed rows the strip currently shows (the total at rest). */
  installedCount: number;
  /** How many connectable apps match the shared filter (the Available header's
   *  count; the total at rest). Respects a Teams allowlist. */
  availableCount: number;
}

/**
 * Own the catalog surface's ONE controls row once: the tab + shared query +
 * category state, the {@link filterInstalledBy} result feeding the Installed
 * strip, and the connectable-match count feeding the Available header. Shared by
 * the global Integrations page and the per-agent Integrations tab so the
 * two-section wiring lives in one place; a parent that remounts per agent
 * (`key={agent.id}`) gets naturally per-agent state. `allowlist` (`null` =
 * unrestricted) only narrows the available count — locked apps never count.
 */
export function useCatalogSurface(opts: {
  active: readonly InstalledRow[];
  custom: CustomIntegrationView[];
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  allowlist?: string[] | null;
}): CatalogSurface {
  const { active, custom, catalog, connections, allowlist = null } = opts;
  const [tab, setTab] = useState("catalog");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const filtering = query.trim() !== "" || category !== "all";
  const shown = useMemo(
    () => filterInstalledBy(active, custom, catalog, { query, category }),
    [active, custom, catalog, query, category],
  );
  const availableCount = useMemo(() => {
    const connected = new Set(connections.map((c) => c.toolkit));
    return browseCatalogView({ catalog, query, category, connected, allowlist })
      .connectable.length;
  }, [catalog, connections, query, category, allowlist]);

  return {
    tab,
    setTab,
    query,
    setQuery,
    category,
    setCategory,
    filtering,
    shown,
    installedCount: shown.active.length + shown.custom.length,
    availableCount,
  };
}
