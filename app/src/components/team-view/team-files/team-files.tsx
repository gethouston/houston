import {
  FilesColumnBand,
  type SortDirection,
  type SortKey,
} from "@houston-ai/agent";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TeamView } from "../../../lib/teams-model";
import { PageHeaderTools } from "../../shell/page-header/page-header-tools";
import { TeamFilesEmpty } from "../team-empty";
import { TeamFilesAgentSection } from "./team-files-agent-section";
import { initialExpandedAgents, toggleExpandedAgent } from "./team-files-model";
import { type TeamFileActions, TeamFilesToolbar } from "./team-files-toolbar";

/** One flat team list. Agent accordions are filesystem boundaries, not doors. */
export function TeamFiles({
  team,
  agentFocusId,
}: {
  team: TeamView;
  agentFocusId?: string;
}) {
  const { t: agentT } = useTranslation("agents");
  const agents = agentFocusId
    ? team.agents.filter((agent) => agent.id === agentFocusId)
    : team.agents;
  const [expanded, setExpanded] = useState(() => initialExpandedAgents(agents));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{
    key: SortKey;
    dir: SortDirection;
  }>({ key: "name", dir: "asc" });
  const [folderRequests, setFolderRequests] = useState<Record<string, number>>(
    {},
  );
  const [actions] = useState(() => new Map<string, TeamFileActions>());
  // Lazy state allocates once; the version counter repaints map consumers.
  const [, setActionsVersion] = useState(0);
  const onActionsReady = useCallback(
    () => setActionsVersion((version) => version + 1),
    [],
  );
  if (agents.length === 0) return <TeamFilesEmpty team={team} />;
  const onSort = (key: typeof sort.key) =>
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc",
    }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeaderTools>
        {() => (
          <TeamFilesToolbar
            agents={agents}
            actions={actions}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </PageHeaderTools>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
        <FilesColumnBand
          labels={{
            columnName: agentT("files.columns.name"),
            columnDateModified: agentT("files.columns.dateModified"),
            columnSize: agentT("files.columns.size"),
          }}
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={onSort}
        />
        {agents.map((agent) => (
          <TeamFilesAgentSection
            key={agent.id}
            agent={agent}
            expanded={expanded.has(agent.id)}
            onToggle={() =>
              setExpanded((current) => toggleExpandedAgent(current, agent.id))
            }
            query={query}
            sort={sort}
            actions={actions}
            createFolderRequest={folderRequests[agent.id] ?? 0}
            onRequestNewFolder={() => {
              setExpanded((current) => new Set(current).add(agent.id));
              setFolderRequests((current) => ({
                ...current,
                [agent.id]: (current[agent.id] ?? 0) + 1,
              }));
            }}
            onActionsReady={onActionsReady}
          />
        ))}
      </div>
    </div>
  );
}
