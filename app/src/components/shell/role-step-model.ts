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

/** What the role filter can reach: every job in the catalog, whatever industry
 *  the user answered with (`roleRunsForQuery` searches all of them). */
export const ROLE_SEARCH_REACH = AGENT_ROLE_IDS.length;

/** The words the runs are read in. The catalog holds ids alone, so every label
 *  arrives from the caller's translations. */
export interface RoleRunLabels {
  role: (id: AgentRoleId) => string;
  /** Heads the shared jobs under the picked context's own. */
  more: string;
  /** Heads the matches the query found outside the picked context. */
  other: string;
}

/**
 * The role runs for a query.
 *
 * Unanswered, the question offers the picked context's own jobs first and the
 * shared ones under their own heading. The moment the user types, the filter
 * reaches the WHOLE catalog: someone who answered "Freight" and then searches
 * "bookkeeper" means the job, not the industry it happens to be filed under.
 * The context's own matches still lead, because they are the ones the first
 * answer earned; every other match rides one run behind them, each role once
 * and sorted by its label so the run reads the way it is scanned.
 *
 * A context the user typed themselves has no run of its own, so its matches
 * come back as the single unlabelled run.
 */
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

/** What the person's own role question can reach: every leadership position
 *  on top of every job. */
export const SELF_ROLE_SEARCH_REACH =
  ROLE_SEARCH_REACH + LEADERSHIP_ROLE_IDS.length;

/** The words the person's own role runs are read in. */
export interface SelfRoleRunLabels extends RoleRunLabels {
  leadershipRole: (id: LeadershipRoleId) => string;
  /** Heads the leadership positions. */
  leadership: string;
  /** Heads the picked context's own jobs: the industry's name. */
  context: string;
}

/**
 * The role runs when the person answers for themselves: the leadership
 * positions lead, in their authored order (the people most likely to decide
 * on Houston read their answer first), then the job runs of
 * {@link roleRunsForQuery}. With the positions on top every run is headed, so
 * no run of jobs reads as more leadership; a query that leaves one run alone
 * drops the heading, as a single run always does.
 */
export function selfRoleRunsForQuery(
  contextId: AgentContextId | null,
  query: string,
  labels: SelfRoleRunLabels,
): ChoiceSection[] {
  const needle = foldForSearch(query.trim());
  const leadership = LEADERSHIP_ROLE_IDS.map((id): ChoiceOption => ({
    id,
    label: labels.leadershipRole(id),
  })).filter(
    (choice) => !needle || foldForSearch(choice.label).includes(needle),
  );
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
