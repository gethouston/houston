import { useMemo } from "react";
import { useComputeUsage, useOrgUsage } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useAgentStore } from "../../stores/agents";
import { hoursAvailable, orgChartUsage, orgChartWork } from "./org-chart-model";
import {
  heroFigures,
  heroMessagesRead,
  messagesCounted,
  orgChartScope,
} from "./org-chart-scope";
import { SHARE_CARD_CAPS } from "./org-chart-share-model";
import { buildOrgTree, SCREEN_TREE_CAPS } from "./org-chart-tree";
import {
  buildLedger,
  ledgerColumns,
  orgChartLead,
  orgChartRead,
  orgChartState,
} from "./org-chart-view-model";
import type { OrgViewContext } from "./organization-view";
import { rosterPersonName } from "./people-tab-model";
import { useStableByContent } from "./use-stable-by-content";

/**
 * Everything the org chart draws, read and ranked. Time worked is read only
 * where the deployment serves it; message usage only for owners and admins
 * (the gateway serves nobody else). Both queries park themselves while Admin
 * is off screen (`useAdminScreenActive`), and a read that never landed stays
 * `loading`, so nothing is drawn from data that is not there. Each read is
 * rolled up once per answer, against the day it landed on, so a figure and
 * its chart always count the same window.
 */
export function useOrgChartData(ctx: OrgViewContext) {
  const agents = useAgentStore((store) => store.agents);
  const agentsLoaded = useAgentStore((store) => store.loaded);
  const { capabilities } = useCapabilities();
  const hoursOn = hoursAvailable(capabilities);
  const permitted = ctx.role === "owner" || ctx.role === "admin";
  const compute = useComputeUsage(hoursOn);
  const usage = useOrgUsage(permitted);
  const members = ctx.org.members;
  const scope = orgChartScope({ role: ctx.role, personal: ctx.isPersonal });

  const work = useMemo(
    () =>
      compute.data ? orgChartWork(agents, compute.data.rows, new Date()) : null,
    [agents, compute.data],
  );
  const counts = useMemo(
    () =>
      usage.data
        ? orgChartUsage(
            agents.filter((agent) => messagesCounted(agent, scope)),
            usage.data,
            new Date(),
          )
        : null,
    [agents, usage.data, scope],
  );
  const lines = useMemo(
    () => buildLedger(agents, members ?? [], { work, usage: counts, scope }),
    [agents, members, work, counts, scope],
  );
  const trees = useMemo(() => {
    const input = {
      agents,
      members: members ?? [],
      name: ctx.org.name,
      personal: ctx.isPersonal,
    };
    return {
      screen: buildOrgTree(input, SCREEN_TREE_CAPS),
      share: buildOrgTree(input, SHARE_CARD_CAPS),
    };
  }, [agents, members, ctx.org.name, ctx.isPersonal]);
  const screenTree = useStableByContent(trees.screen);
  const shareTree = useStableByContent(trees.share);
  const figures = heroFigures({
    scope,
    lines,
    people: members?.length ?? 0,
    work,
    usage: counts,
  });

  const hours = orgChartRead({
    enabled: hoursOn,
    hasData: work !== null,
    isError: compute.isError,
  });
  const messages = orgChartRead({
    enabled: permitted,
    hasData: counts !== null,
    isError: usage.isError,
  });
  const lead = orgChartLead(
    hours,
    heroMessagesRead(messages, figures.messages),
  );
  const owner = members?.find((member) => member.role === "owner");
  const leadRead = lead?.metric === "hours" ? work : counts;

  return {
    state: orgChartState({ agentsLoaded, agentCount: agents.length }),
    title: ctx.isPersonal && owner ? rosterPersonName(owner) : ctx.org.name,
    lines,
    trees: { screen: screenTree, share: shareTree },
    lead,
    reads: { hours, messages },
    columns: ledgerColumns(lead, messages, ctx.isPersonal),
    figures,
    series: leadRead ? { values: leadRead.series, from: leadRead.from } : null,
    retry: {
      hours: () => void compute.refetch(),
      messages: () => void usage.refetch(),
    },
  };
}
