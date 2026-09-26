/**
 * The chart uses one scale for all personal folder and ungrouped agent cards.
 */

/**
 * What the chart puts where a message count would go. `hidden` is a caller the
 * gateway serves no usage to: the counts, the bars AND the window caption go
 * away together, because a chart of zeroes would read as a silent company
 * rather than as a number nobody is allowed to see.
 */
export type OrgChartUsageState = "hidden" | "loading" | "error" | "ready";

export function orgChartUsageState(input: {
  permitted: boolean;
  isLoading: boolean;
  isError: boolean;
}): OrgChartUsageState {
  if (!input.permitted) return "hidden";
  if (input.isError) return "error";
  if (input.isLoading) return "loading";
  return "ready";
}

/**
 * The busiest agent in the WHOLE chart. Every bar is drawn against this one
 * scale, so a half-full bar means the same thing in every card. Never 0: the
 * percentage divides by it.
 */
export function orgChartScale(byAgent: ReadonlyMap<string, number>): number {
  let max = 0;
  for (const messages of byAgent.values()) max = Math.max(max, messages);
  return max || 1;
}

/**
 * How much of an agent's bar is filled. A silent agent stays EMPTY (its row
 * still renders, so a team reads complete), while any real traffic keeps a 2%
 * floor so one message is still visible beside the busiest agent.
 */
export function orgChartBarPercent(messages: number, scale: number): number {
  if (messages <= 0) return 0;
  return Math.max(2, Math.min(100, Math.round((messages / scale) * 100)));
}

export type OrgChartTeamsState = "loading" | "empty" | "ready";

export function orgChartTeamsState(input: {
  agentsLoaded: boolean;
  teamCount: number;
}): OrgChartTeamsState {
  if (!input.agentsLoaded) return "loading";
  return input.teamCount > 0 ? "ready" : "empty";
}

export function orgChartCardOrder(
  ungroupedCount: number,
  teamIds: readonly string[],
): (string | null)[] {
  return ungroupedCount > 0 ? [null, ...teamIds] : [...teamIds];
}
