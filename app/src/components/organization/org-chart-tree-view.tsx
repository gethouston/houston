import { Button } from "@houston-ai/core";
import { Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CAPTION } from "./org-chart-caption";
import type { OrgTree } from "./org-chart-tree";
import {
  BRANCH_ITEM,
  BRANCH_LIST,
  LEAF_ITEM,
  LEAF_LIST,
} from "./org-chart-tree-lines";
import {
  TreeAgentNode,
  TreeCompanyNode,
  TreeMoreNode,
  TreePersonNode,
} from "./org-chart-tree-nodes";

interface TreeViewProps {
  tree: OrgTree;
  onOpenBoard: (agentId: string) => void;
  onOpenPerson: (userId: string) => void;
  onShare: () => void;
}

/**
 * The org chart drawn as one: the space at the top, its people under it,
 * each person's AI Employees under them, joined by thin lines. Desktop
 * spreads the people across (scrolling sideways when wide); the phone reads
 * it as an indented outline. The Share pill opens the share image.
 */
export function OrgChartTreeView(props: TreeViewProps) {
  const { t } = useTranslation("teams");
  const { tree } = props;
  const roleOf = (role: "owner" | "admin" | "user") =>
    t(`people.roles.${role}`);
  const agents = t("orgChart.agentCount", { count: tree.counts.agents });
  const counts =
    tree.root.kind === "person"
      ? agents
      : t("orgChart.share.cardCounts", {
          people: t("orgChart.peopleCount", { count: tree.counts.people }),
          agents,
        });

  return (
    <section
      aria-label={t("orgChart.tree.label")}
      data-org-tree=""
      className="flex flex-col gap-5 md:gap-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className={CAPTION}>{t("orgChart.tree.title")}</h3>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={props.onShare}
        >
          <Share2 className="size-4" />
          {t("orgChart.share.open")}
        </Button>
      </div>
      <div className="md:overflow-x-auto md:pb-2">
        <div className="min-w-0 md:w-max md:min-w-full">
          {tree.root.kind === "person" ? (
            <TreePersonNode
              person={tree.root.person}
              size="root"
              sub={counts}
              onOpen={props.onOpenPerson}
            />
          ) : (
            <TreeCompanyNode name={tree.root.name} sub={counts} />
          )}
          <Branches {...props} roleOf={roleOf} />
        </div>
      </div>
    </section>
  );
}

function Branches({
  tree,
  onOpenBoard,
  onOpenPerson,
  roleOf,
}: TreeViewProps & { roleOf: (role: "owner" | "admin" | "user") => string }) {
  const { t } = useTranslation("teams");
  const empty =
    tree.branches.length === 0 &&
    tree.rootAgents.length === 0 &&
    tree.morePeople === 0 &&
    tree.moreRootAgents === 0;
  if (empty) return null;
  return (
    <ul className={BRANCH_LIST}>
      {tree.branches.map((branch) => (
        <li key={branch.person.userId} className={BRANCH_ITEM}>
          <TreePersonNode
            person={branch.person}
            size="branch"
            sub={roleOf(branch.person.role)}
            onOpen={onOpenPerson}
          />
          {(branch.agents.length > 0 || branch.moreAgents > 0) && (
            <ul className={LEAF_LIST}>
              {branch.agents.map((agent) => (
                <li key={agent.id} className={LEAF_ITEM}>
                  <TreeAgentNode
                    agent={agent}
                    size="leaf"
                    onOpen={onOpenBoard}
                  />
                </li>
              ))}
              {branch.moreAgents > 0 && (
                <li className={LEAF_ITEM}>
                  <TreeMoreNode
                    count={branch.moreAgents}
                    label={t("orgChart.tree.moreAgents", {
                      count: branch.moreAgents,
                    })}
                    size="leaf"
                  />
                </li>
              )}
            </ul>
          )}
        </li>
      ))}
      {tree.morePeople > 0 && (
        <li className={BRANCH_ITEM}>
          <TreeMoreNode
            count={tree.morePeople}
            label={t("orgChart.tree.morePeople", { count: tree.morePeople })}
            sub={
              tree.morePeopleAgents > 0
                ? t("orgChart.agentCount", { count: tree.morePeopleAgents })
                : undefined
            }
            size="branch"
          />
        </li>
      )}
      {tree.rootAgents.map((agent) => (
        <li key={agent.id} className={BRANCH_ITEM}>
          <TreeAgentNode agent={agent} size="branch" onOpen={onOpenBoard} />
        </li>
      ))}
      {tree.moreRootAgents > 0 && (
        <li className={BRANCH_ITEM}>
          <TreeMoreNode
            count={tree.moreRootAgents}
            label={t("orgChart.tree.moreAgents", {
              count: tree.moreRootAgents,
            })}
            size="branch"
          />
        </li>
      )}
    </ul>
  );
}
