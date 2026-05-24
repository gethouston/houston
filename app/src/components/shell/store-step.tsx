import { useMemo } from "react";
import { Input } from "@houston-ai/core";
import { Gift, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentDefinition, StoreListing } from "../../lib/types";
import { SkillCard } from "../skill-card";
import { AgentCard, StoreAgentCard } from "./experience-card";
import { useUIStore } from "../../stores/ui";

interface StoreStepProps {
  search: string;
  onSearchChange: (value: string) => void;
  agents: AgentDefinition[];
  storeCatalog: StoreListing[];
  onSelect: (id: string) => void;
  onInstall: (listing: StoreListing) => Promise<void>;
  onCreateWithAi: () => void;
}

export function StoreStep({
  search,
  onSearchChange,
  agents,
  storeCatalog,
  onSelect,
  onInstall,
  onCreateWithAi,
}: StoreStepProps) {
  const { t } = useTranslation(["shell", "portable"]);
  const setImportOpen = useUIStore((s) => s.setImportFromFriendOpen);
  const setCreateOpen = useUIStore((s) => s.setCreateAgentDialogOpen);

  const storeIds = useMemo(
    () => new Set(storeCatalog.map((listing) => listing.id)),
    [storeCatalog],
  );
  const query = search.trim().toLowerCase();

  const filteredAgents = useMemo(
    () =>
      agents.filter((d) => {
        if (d.source === "installed" && d.config.author === "Houston") {
          return false;
        }
        if (storeIds.has(d.config.id)) return false;
        if (!query) return true;
        return matchesAgent(d, query);
      }),
    [agents, query, storeIds],
  );

  const filteredStore = useMemo(
    () =>
      storeCatalog.filter((listing) => {
        if (!query) return true;
        return matchesListing(listing, query);
      }),
    [query, storeCatalog],
  );

  const reorderedAgents = useMemo(() => {
    if (!query) {
      const result = [...filteredAgents];
      const paIndex = result.findIndex(
        (a) => a.config.id === "personal-assistant",
      );
      // Pin personal-assistant to array index 1 (grid slot 1) so it sits right
      // after the SkillCard tile, which renders outside this map at grid slot 0.
      if (paIndex >= 0 && paIndex !== 1) {
        const [pa] = result.splice(paIndex, 1);
        result.splice(1, 0, pa);
      }
      return result;
    }
    return filteredAgents;
  }, [filteredAgents, query]);

  const totalResults = filteredAgents.length + filteredStore.length;

  return (
    <>
      <div className="shrink-0 px-6 pb-4">
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
            {!query && (
              <SkillCard
                image="rocket"
                title={t("aiAssist.cardTitle")}
                description={t("aiAssist.cardDescription")}
                className="min-h-[132px]"
                onClick={onCreateWithAi}
              />
            )}
            {reorderedAgents.map((def) => (
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
