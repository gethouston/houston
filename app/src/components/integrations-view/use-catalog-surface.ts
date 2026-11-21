import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import {
  type FilteredInstalled,
  filterInstalledBy,
  type InstalledRow,
} from "../../lib/installed-preview";
import { browseCatalog, catalogHiddenToolkits } from "../integrations";

export interface CatalogSurface {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  category: string;
  setCategory: (value: string) => void;
  filtering: boolean;
  shown: FilteredInstalled;
  installedCount: number;
  availableCount: number;
}

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
