import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import {
  type FilteredInstalled,
  filterInstalledBy,
  type InstalledRow,
} from "../../lib/installed-preview";
import { browseCatalog, catalogHiddenToolkits } from "../integrations";

/** The consolidated catalog surface's shared view state, ready for
 *  {@link CatalogShell}. */
export interface CatalogSurface {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
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
   *  count; the total at rest). */
  availableCount: number;
}

/**
 * Own the catalog surface's ONE controls row once: the shared query +
 * category state, the {@link filterInstalledBy} result feeding the Installed
 * strip, and the connectable-match count feeding the Available header, so the
 * two-section wiring lives in one place.
 */
export function useCatalogSurface(opts: {
  active: readonly InstalledRow[];
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  custom: CustomIntegrationView[];
}): CatalogSurface {
  const { active, catalog, connections, custom } = opts;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const filtering = query.trim() !== "" || category !== "all";
  const shown = useMemo(
    () => filterInstalledBy(active, custom, catalog, { query, category }),
    [active, custom, catalog, query, category],
  );
  const availableCount = useMemo(() => {
    const connected = catalogHiddenToolkits(connections);
    return browseCatalog({ catalog, query, category, connected }).length;
  }, [catalog, connections, query, category]);

  return {
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
