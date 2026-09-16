import type { OrgMember } from "@houston/engine-adapter";

/**
 * Pure, DOM-free derivations for Admin > Org chart: the order the team cards
 * read in, the one scale every usage bar is drawn against, which humans a card
 * has to show, and the single question of whether message counts are drawn at
 * all. Node:test-safe (no React, no DOM). Membership and the message totals
 * themselves are `org-chart-model.ts`.
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
 * The team cards in reading order: the named teams the company built, then the
 * default team, which is whoever is left over. Alone it is not leftovers but
 * the whole company, so it stays first and the chart opens on people rather
 * than on an afterthought.
 */
export function orgChartTeamOrder<T extends { isDefault: boolean }>(
  teams: readonly T[],
): T[] {
  if (teams.length <= 1) return [...teams];
  return [
    ...teams.filter((team) => !team.isDefault),
    ...teams.filter((team) => team.isDefault),
  ];
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

/**
 * Whether a card's humans can be counted yet. The membership read is the only
 * thing between a card and its people, and a card that counts off an empty
 * `data` while that read is in flight claims a team nobody is in. `ready` with
 * no read to make is the everyone-card ({@link orgChartTeamMembership}): its
 * people are the workspace roster, already in hand.
 */
export type OrgChartMembersState = "ready" | "loading" | "error";

export function orgChartMembersState(input: {
  readsMembers: boolean;
  isPending: boolean;
  isError: boolean;
}): OrgChartMembersState {
  if (!input.readsMembers) return "ready";
  if (input.isError) return "error";
  return input.isPending ? "loading" : "ready";
}

/**
 * What the chart draws in place of its cards. "No teams yet" is a claim about
 * the company, so it is spent only on a read that SETTLED and found none: a
 * failed teams read says so and offers the retry, and teams already in hand
 * are drawn even when a refetch behind them failed.
 */
export type OrgChartTeamsState = "loading" | "error" | "empty" | "ready";

export function orgChartTeamsState(input: {
  agentsLoaded: boolean;
  teamsLoading: boolean;
  teamsError: boolean;
  teamCount: number;
}): OrgChartTeamsState {
  if (!input.agentsLoaded) return "loading";
  if (input.teamCount > 0) return "ready";
  if (input.teamsLoading) return "loading";
  return input.teamsError ? "error" : "empty";
}

/**
 * Whose humans one card lists, and whether it has a membership read to make.
 *
 * `everyone` is a team whose people ARE the workspace roster: the default team
 * (agents nobody filed), the personal space (one human, the caller), and every
 * team on the local backend, which stores no human memberships at all. Only a
 * named team on an `agentTeams` host has explicit rows worth fetching.
 */
export function orgChartTeamMembership(input: {
  personal: boolean;
  serverBacked: boolean;
  isDefault: boolean;
}): { everyone: boolean; readsMembers: boolean } {
  const everyone = input.personal || input.isDefault || !input.serverBacked;
  return { everyone, readsMembers: !everyone };
}

/**
 * The humans the chart has to work with. A personal space has exactly one —
 * the caller — and the gateway serves no roster there, so the session fills the
 * gap rather than leaving the card with no people in it.
 */
export function orgChartRoster(input: {
  personal: boolean;
  roster: readonly OrgMember[];
  self: OrgMember | null;
}): OrgMember[] {
  if (input.roster.length > 0) return [...input.roster];
  if (!input.personal || !input.self) return [];
  return [input.self];
}
