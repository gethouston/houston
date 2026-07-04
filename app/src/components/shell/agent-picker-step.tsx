import { Input } from "@houston-ai/core";
import { Gift, Github, Search } from "lucide-react";
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
  onInstallFromGithub: () => void;
}

export function AgentPickerStep({
  search,
  onSearchChange,
  agents,
  onSelect,
  onCreateWithAi,
  onInstallFromGithub,
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

  const filteredAgents = useMemo(
    () =>
      agents.filter((d) => {
        if (d.source === "installed" && d.config.author === "Houston") {
          return false;
        }
        if (!query) return true;
        return matchesAgent(d, localizedAgents.get(d.config.id), query);
      }),
    [agents, query, localizedAgents],
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
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setCreateOpen(false);
              setImportOpen(true);
            }}
            className="w-full rounded-xl border border-border/40 bg-secondary px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3"
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
          <button
            type="button"
            onClick={onInstallFromGithub}
            className="w-full rounded-xl border border-border/40 bg-secondary px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3"
          >
            <Github className="size-5 text-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t("shell:newAgent.githubCard")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("shell:newAgent.githubCardDescription")}
              </p>
            </div>
          </button>
        </div>
        {filteredAgents.length > 0 ? (
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
            {reorderedAgents.map((def) => {
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
