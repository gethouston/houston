import { analytics } from "../../lib/analytics";
import type { ShareChannel } from "./org-chart-share-model";
import type { OrgTree } from "./org-chart-tree";

/** Counts only: no names ride a share event. */
export function shareCounts(tree: OrgTree) {
  return { agent_count: tree.counts.agents, people_count: tree.counts.people };
}

export function trackShare(channel: ShareChannel, tree: OrgTree) {
  analytics.track("org_chart_shared", {
    share_channel: channel,
    ...shareCounts(tree),
  });
}
