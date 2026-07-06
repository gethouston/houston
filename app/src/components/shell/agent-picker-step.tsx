import { Input } from "@houston-ai/core";
import { Search } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type CatalogCopy,
  localizeCatalogCopy,
} from "../../agents/catalog-labels";
import type { AgentDefinition } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { SkillCard } from "../skill-card";
import { AgentCard } from "./experience-card";

interface AgentPickerStepProps {
  search: string;
  onSearchChange: (value: string) => void;
  agents: AgentDefinition[];
  onSelect: (id: string) => void;
  onCreateWithAi: () => void;
}

export function AgentPickerStep({
  search,
  onSearchChange,
  agents,
  onSelect,
  onCreateWithAi,
}: AgentPickerStepProps) {
  const { t, i18n } = useTranslation(["shell", "portable", "agents"]);
  const setImportOpen = useUIStore((s) => s.setImportFromFriendOpen);
  const setCreateOpen = useUIStore((s) => s.setCreateAgentDialogOpen);

  const query = search.trim().toLowerCase();

  // Houston's first-party agents (`author === "Houston"`) render in the user's
  // language; third-party agents keep their author's language. Recompute when
  // the active language changes so switching locales relabels the picker live.
  // biome-ignore lint/correctness/useExhaustiveDependencies: i18n.language is required to relabel on locale switch
  const localizedAgents = useMemo(() => {
    const map = new Map<string, CatalogCopy>();
    for (const def of agents) {
      map.set(def.config.id, localizeCatalogCopy(def.config, t));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, t, i18n.language]);

  // The "From library" grid: every catalog agent EXCEPT the blank starter
  // (it has its own "From scratch" card in the Create section) and Houston's
  // own already-installed copies, narrowed by the active search query.
  const libraryAgents = useMemo(
    () =>
      agents.filter((d) => {
        if (d.config.id === "blank") return false;
        if (d.source === "installed" && d.config.author === "Houston") {
          return false;
        }
        if (!query) return true;
        return matchesAgent(d, localizedAgents.get(d.config.id), query);
      }),
    [agents, query, localizedAgents],
  );

  return (
    <>
      {/* Create — three uniform cards, pinned above the library. These are the
          ways to make a NEW agent, always one click away (search below only
          narrows the library). */}
      <div className="shrink-0 px-6 pb-5">
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t("newAgent.createSection")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SkillCard
            image="pencil"
            title={t("newAgent.fromScratchCard")}
            description={t("newAgent.fromScratchDescription")}
            className="min-h-[128px]"
            onClick={() => onSelect("blank")}
          />
          <SkillCard
            image="rocket"
            title={t("aiAssist.cardTitle")}
            description={t("aiAssist.cardDescription")}
            className="min-h-[128px]"
            onClick={onCreateWithAi}
          />
          <SkillCard
            image="wrapped-gift"
            title={t("portable:newAgent.fromFriendCard")}
            description={t("portable:newAgent.fromFriendDescription")}
            className="min-h-[128px]"
            onClick={() => {
              setCreateOpen(false);
              setImportOpen(true);
            }}
          />
        </div>
      </div>

      {/* From library — its own header carries the search box; only the grid
          below it scrolls, so the section title + search stay pinned. */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-border/50 px-6 pt-4 pb-6">
        <div className="shrink-0 flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-medium text-foreground">
            {t("newAgent.librarySection")}
          </h3>
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("store.searchPlaceholder")}
              className="pl-9 rounded-full bg-secondary border-border"
            />
          </div>
        </div>

        <div
          data-tour-target="agentStore"
          className="flex-1 min-h-0 overflow-y-auto"
        >
          {libraryAgents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {libraryAgents.map((def) => {
                const display = localizedAgents.get(def.config.id);
                return (
                  <AgentCard
                    key={def.config.id}
                    config={def.config}
                    title={display?.name}
                    description={display?.description}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">
                {t("store.noResults")}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function matchesAgent(
  def: AgentDefinition,
  display: CatalogCopy | undefined,
  query: string,
): boolean {
  const config = def.config;
  const name = display?.name ?? config.name;
  const description = display?.description ?? config.description;
  return (
    name.toLowerCase().includes(query) ||
    description.toLowerCase().includes(query) ||
    config.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
    config.integrations?.some((toolkit) =>
      toolkit.toLowerCase().includes(query),
    ) ||
    false
  );
}
