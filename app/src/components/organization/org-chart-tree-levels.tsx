import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { OrgTree } from "./org-chart-tree";
import {
  TreeAgentNode,
  TreeCompanyNode,
  TreeMoreNode,
  TreePersonNode,
} from "./org-chart-tree-nodes";
import { NODE_ID } from "./org-chart-tree-paths";

export interface TreeHandlers {
  onOpenBoard: (agentId: string) => void;
  onOpenPerson: (userId: string) => void;
}

/**
 * The tree's nodes, grouped the way both layouts read them: the root, then
 * each first-level column (a person with the AI Employees under them, or a
 * personal space's AI Employee, or a "+N"). The layouts only arrange these.
 */
export function useTreeParts(tree: OrgTree, handlers: TreeHandlers) {
  const { t } = useTranslation("teams");
  const agents = t("orgChart.agentCount", { count: tree.counts.agents });
  const counts =
    tree.root.kind === "person"
      ? agents
      : t("orgChart.share.cardCounts", {
          people: t("orgChart.peopleCount", { count: tree.counts.people }),
          agents,
        });
  const root =
    tree.root.kind === "person" ? (
      <TreePersonNode
        id={NODE_ID.root}
        person={tree.root.person}
        sub={counts}
        onOpen={handlers.onOpenPerson}
      />
    ) : (
      <TreeCompanyNode id={NODE_ID.root} name={tree.root.name} sub={counts} />
    );

  const columns: {
    key: string;
    head: ReactNode;
    stack: { key: string; node: ReactNode }[];
  }[] = [];
  for (const branch of tree.branches) {
    const { person } = branch;
    const stack = branch.agents.map((agent) => ({
      key: agent.id,
      node: (
        <TreeAgentNode
          id={NODE_ID.agent(agent.id)}
          agent={agent}
          onOpen={handlers.onOpenBoard}
        />
      ),
    }));
    if (branch.moreAgents > 0)
      stack.push({
        key: NODE_ID.moreAgents(person.userId),
        node: (
          <TreeMoreNode
            id={NODE_ID.moreAgents(person.userId)}
            count={branch.moreAgents}
            label={t("orgChart.tree.moreAgents", { count: branch.moreAgents })}
          />
        ),
      });
    columns.push({
      key: person.userId,
      head: (
        <TreePersonNode
          id={NODE_ID.person(person.userId)}
          person={person}
          sub={t(`people.roles.${person.role}`)}
          onOpen={handlers.onOpenPerson}
        />
      ),
      stack,
    });
  }
  if (tree.morePeople > 0)
    columns.push({
      key: NODE_ID.morePeople,
      head: (
        <TreeMoreNode
          id={NODE_ID.morePeople}
          count={tree.morePeople}
          label={t("orgChart.tree.morePeople", { count: tree.morePeople })}
          sub={
            tree.morePeopleAgents > 0
              ? t("orgChart.agentCount", { count: tree.morePeopleAgents })
              : undefined
          }
        />
      ),
      stack: [],
    });
  for (const agent of tree.rootAgents)
    columns.push({
      key: agent.id,
      head: (
        <TreeAgentNode
          id={NODE_ID.agent(agent.id)}
          agent={agent}
          onOpen={handlers.onOpenBoard}
        />
      ),
      stack: [],
    });
  if (tree.moreRootAgents > 0)
    columns.push({
      key: NODE_ID.moreRoot,
      head: (
        <TreeMoreNode
          id={NODE_ID.moreRoot}
          count={tree.moreRootAgents}
          label={t("orgChart.tree.moreAgents", { count: tree.moreRootAgents })}
        />
      ),
      stack: [],
    });
  return { root, columns };
}
