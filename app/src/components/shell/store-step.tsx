import { useMemo, useState } from "react";
import { Input } from "@houston-ai/core";
import { Gift, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentDefinition, StoreListing } from "../../lib/types";
import { AgentCard, StoreAgentCard } from "./experience-card";
import { StoreStepDiscover } from "./store-step-discover";
import { useUIStore } from "../../stores/ui";

interface StoreStepProps {
  search: string;
  onSearchChange: (value: string) => void;
  agents: AgentDefinition[];
  storeCatalog: StoreListing[];
  onSelect: (id: string) => void;
  onInstall: (listing: StoreListing) => Promise<void>;
  /** Slugs of toolkits the user has already authorized. Passed through
   *  to the discover disclosure so the recommender can mark them as
   *  connected and bias toward reuse. Defaults to empty. */
  connectedToolkits?: string[];
}

export function StoreStep({
  search,
  onSearchChange,
  agents,
  storeCatalog,
  onSelect,
  onInstall,
  connectedToolkits = [],
}: StoreStepProps) {
  const { t } = useTranslation(["shell", "portable"]);
  const setImportOpen = useUIStore((s) => s.setImportFromFriendOpen);
  const setCreateOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const [recommendedSlugs, setRecommendedSlugs] = useState<string[]>([]);
  const recommendedSet = useMemo(
    () => new Set(recommendedSlugs),
    [recommendedSlugs],
  );

  const storeIds = useMemo(
    () => new Set(storeCatalog.map((listing) => listing.id)),
    [storeCatalog],
  );
  const query = search.trim().toLowerCase();

  const filteredAgents = useMemo(() => {
    const filtered = agents.filter((d) => {
      if (d.source === "installed" && d.config.author === "Houston") {
        return false;
      }
      if (storeIds.has(d.config.id)) return false;
      if (!query) return true;
      return matchesAgent(d, query);
    });
    return rankByToolkitOverlap(filtered, recommendedSet, (d) =>
      d.config.integrations ?? [],
    );
  }, [agents, query, storeIds, recommendedSet]);

  const filteredStore = useMemo(() => {
    const filtered = storeCatalog.filter((listing) => {
      if (!query) return true;
      return matchesListing(listing, query);
    });
    return rankByToolkitOverlap(filtered, recommendedSet, (l) => l.integrations ?? []);
  }, [query, storeCatalog, recommendedSet]);

  const totalResults = filteredAgents.length + filteredStore.length;

  return (
    <>
      <div className="shrink-0 px-6 pb-4 space-y-3">
        <StoreStepDiscover
          connectedToolkits={connectedToolkits}
          onStackRecommended={setRecommendedSlugs}
        />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("store.searchPlaceholder")}
            className="pl-9 rounded-full bg-secondary border-border focus:bg-background"
          />
        </div>
      </div>

      <div
        data-tour-target="agentStore"
        className="flex-1 min-h-0 overflow-y-auto px-6 pb-6"
      >
        <button
          type="button"
          onClick={() => {
            setCreateOpen(false);
            setImportOpen(true);
          }}
          className="w-full mb-3 rounded-xl border border-border/40 bg-secondary px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3"
        >
          <Gift className="size-5 text-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("portable:newAgent.fromFriendCard")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("portable:newAgent.fromFriendDescription")}
            </p>
          </div>
        </button>
        {totalResults > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAgents.map((def) => (
              <AgentCard
                key={def.config.id}
                config={def.config}
                onSelect={onSelect}
              />
            ))}
            {filteredStore.map((listing) => (
              <StoreAgentCard
                key={listing.id}
                listing={listing}
                onInstall={onInstall}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              {t("store.noResults")}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Stable sort that floats items with the highest toolkit overlap to the
 * top. Items with zero overlap keep their original relative order so
 * the un-recommended list stays predictable.
 */
function rankByToolkitOverlap<T>(
  items: T[],
  recommended: Set<string>,
  getIntegrations: (item: T) => string[],
): T[] {
  if (recommended.size === 0) return items;
  return [...items]
    .map((item, idx) => ({
      item,
      idx,
      overlap: overlapCount(getIntegrations(item), recommended),
    }))
    .sort((a, b) => b.overlap - a.overlap || a.idx - b.idx)
    .map(({ item }) => item);
}

function overlapCount(toolkits: string[], recommended: Set<string>): number {
  let n = 0;
  for (const t of toolkits) {
    if (recommended.has(t.toLowerCase())) n++;
  }
  return n;
}

function matchesAgent(def: AgentDefinition, query: string): boolean {
  const config = def.config;
  return (
    config.name.toLowerCase().includes(query) ||
    config.description.toLowerCase().includes(query) ||
    config.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
    config.integrations?.some((toolkit) =>
      toolkit.toLowerCase().includes(query),
    ) ||
    false
  );
}

function matchesListing(listing: StoreListing, query: string): boolean {
  return (
    listing.name.toLowerCase().includes(query) ||
    listing.description.toLowerCase().includes(query) ||
    listing.tags.some((tag) => tag.toLowerCase().includes(query)) ||
    listing.integrations?.some((toolkit) =>
      toolkit.toLowerCase().includes(query),
    ) ||
    false
  );
}
