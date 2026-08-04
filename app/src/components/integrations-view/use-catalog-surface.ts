import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { analytics } from "../../lib/analytics";
import {
  type FilteredInstalled,
  filterInstalledBy,
  type InstalledRow,
} from "../../lib/installed-preview";
import { browseCatalogView, catalogHiddenToolkits } from "../integrations";
import { unsupportedQueryOf } from "./unsupported-search";

/** How long a zero-result query must sit unchanged before it counts as a
 *  request for a missing app rather than a half-typed word (HOU-1193). */
const UNSUPPORTED_SEARCH_SETTLE_MS = 1200;

/** The consolidated catalog surface's shared view state, ready for
 *  {@link CatalogShell}. */
export interface CatalogSurface {
  tab: string;
  setTab: (value: string) => void;
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
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  allowlist?: string[] | null;
  /** Which catalog surface this is, for the unsupported-search analytics. */
  surface: "integrations" | "agent-integrations";
}): CatalogSurface {
  const { active, catalog, connections, allowlist = null, surface } = opts;
  const [tab, setTab] = useState("catalog");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  // HOU-1193: a SETTLED search that matches nothing in the whole catalog is a
  // request for an app Houston doesn't have — report it once per query per
  // mount so demand for unsupported integrations becomes countable (unique
  // persons per query in PostHog = one vote per user).
  const settledQuery = useDebouncedValue(query, UNSUPPORTED_SEARCH_SETTLE_MS);
  const reportedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (settledQuery !== query) return; // still typing — the timer is live
    const missing = unsupportedQueryOf(catalog, settledQuery);
    if (missing === null || reportedRef.current.has(missing)) return;
    reportedRef.current.add(missing);
    analytics.track("integration_unsupported_searched", {
      search_query: missing,
      surface,
    });
  }, [settledQuery, query, catalog, surface]);

  const filtering = query.trim() !== "" || category !== "all";
  // Composio only since the mode split (HOU-980 review): custom integrations
  // live behind their own mode with their own installed list, never in this
  // strip.
  const shown = useMemo(
    () => filterInstalledBy(active, [], catalog, { query, category }),
    [active, catalog, query, category],
  );
  const availableCount = useMemo(() => {
    const connected = catalogHiddenToolkits(connections, allowlist);
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
    installedCount: shown.active.length,
    availableCount,
  };
}
