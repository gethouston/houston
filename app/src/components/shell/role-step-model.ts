import {
  AGENT_ROLE_IDS,
  type AgentContextId,
  type AgentRoleId,
  rolesForContext,
} from "../../lib/agent-role-catalog.ts";
import {
  LEADERSHIP_ROLE_IDS,
  type LeadershipRoleId,
} from "../../lib/leadership-roles.ts";
import {
  type ChoiceOption,
  type ChoiceSection,
  foldForSearch,
} from "./choice-step-model.ts";

export const ROLE_SEARCH_REACH = AGENT_ROLE_IDS.length;

export interface RoleRunLabels {
  role: (id: AgentRoleId) => string;
  more: string;
  other: string;
}

export function roleRunsForQuery(
  contextId: AgentContextId | null,
  query: string,
  labels: RoleRunLabels,
): ChoiceSection[] {
  const { own, common } = rolesForContext(contextId);
  const option = (id: AgentRoleId): ChoiceOption => ({
    id,
    label: labels.role(id),
  });
  const needle = foldForSearch(query.trim());

  if (!needle) {
    const runs: ChoiceSection[] = [];
    if (own.length) runs.push({ id: "own", options: own.map(option) });
    runs.push({
      id: "common",
      label: own.length ? labels.more : undefined,
      options: common.map(option),
    });
    return runs;
  }

  const matches = (choice: ChoiceOption) =>
    foldForSearch(choice.label).includes(needle);
  const led = own.map(option).filter(matches);
  const rest = AGENT_ROLE_IDS.filter((id) => !own.includes(id))
    .map(option)
    .filter(matches)
    .sort((a, b) => a.label.localeCompare(b.label));

  const runs: ChoiceSection[] = [];
  if (led.length) runs.push({ id: "own", options: led });
  if (rest.length) {
    runs.push({
      id: "other",
      label: led.length ? labels.other : undefined,
      options: rest,
    });
  }
  return runs;
}

export const SELF_ROLE_SEARCH_REACH =
  ROLE_SEARCH_REACH + LEADERSHIP_ROLE_IDS.length;

export interface SelfRoleRunLabels extends RoleRunLabels {
  leadershipRole: (id: LeadershipRoleId) => string;
  leadership: string;
  context: string;
}

export function selfRoleRunsForQuery(
  contextId: AgentContextId | null,
  query: string,
  labels: SelfRoleRunLabels,
): ChoiceSection[] {
  const needle = foldForSearch(query.trim());
  const leadership = LEADERSHIP_ROLE_IDS.map(
    (id): ChoiceOption => ({ id, label: labels.leadershipRole(id) }),
  ).filter((choice) => !needle || foldForSearch(choice.label).includes(needle));
  const jobs = roleRunsForQuery(contextId, query, labels);
  if (leadership.length === 0) return jobs;
  if (jobs.length === 0) return [{ id: "leadership", options: leadership }];
  const heading = (run: ChoiceSection) => {
    if (run.id === "own") return labels.context;
    return run.id === "common" ? labels.more : labels.other;
  };
  return [
    { id: "leadership", label: labels.leadership, options: leadership },
    ...jobs.map((run) => ({ ...run, label: run.label ?? heading(run) })),
  ];
}
