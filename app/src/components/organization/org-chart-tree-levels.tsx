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

export function useTreeParts(tree: OrgTree, handlers: TreeHandlers) {
  const { t } = useTranslation("teams");
  const root =
    tree.root.kind === "person" ? (
      <TreePersonNode
        id={NODE_ID.root}
        person={tree.root.person}
        onOpen={handlers.onOpenPerson}
      />
    ) : (
      <TreeCompanyNode id={NODE_ID.root} name={tree.root.name} />
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
          label={t("orgChart.tree.morePeople", { count: tree.morePeople })}
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
          label={t("orgChart.tree.moreAgents", { count: tree.moreRootAgents })}
        />
      ),
      stack: [],
    });
  return { root, columns };
}
