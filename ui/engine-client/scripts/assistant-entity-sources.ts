import type { AssistantRoute } from "./assistant-catalog-types.ts";

/**
 * WHERE a parameter's accepted values come from.
 *
 * An identifier is never guessable. The catalog already says a parameter is a
 * string; what it could not say is that the string must be an agent that exists,
 * and which operation would have listed it — so a model asked to rename an agent
 * invented a slug and the call 404'd with nothing to correct from. This table is
 * the missing half: route shape (or parameter name) -> the operation that
 * enumerates the values.
 *
 * DECLARATIVE on purpose. The mapping is derived from the route the generator
 * already extracted — the literal segment a placeholder follows (`/agents/{x}`
 * -> an agent, `/routines/{x}` -> a routine) — so a new operation on an existing
 * collection is sourced the day it is annotated, with nothing added here. Only
 * genuinely new collections, and the handful of body/query fields whose route
 * cannot say what they are, need a line.
 */

export interface EntityRule {
  /**
   * The literal path segment a placeholder must directly follow for this rule
   * to claim it. `/v1/org/teams/{teamId}` -> `teams`.
   */
  after?: string;
  /**
   * Parameter, body-field or query-key names this rule claims — for the values
   * a path cannot describe (a body field, a query key).
   */
  names?: readonly string[];
  /**
   * Narrows `names` to routes whose path contains this substring. A relative
   * file path means one thing under `/files` (a document in the agent's
   * workspace, which `listProjectFiles` enumerates) and another under
   * `/agentfile` (a `.houston` document addressed by convention, which nothing
   * lists), and the parameter is spelled `relPath` in both.
   */
  pathContains?: string;
  /** The operation whose result lists the accepted values. */
  discovery: string;
}

/**
 * The collections, in the order they are consulted. `after` beats `names`: the
 * route is the stronger evidence, because it is the path the value is actually
 * spliced into.
 */
export const ENTITY_SOURCES: readonly EntityRule[] = [
  // Agents. Every `/agents/{…}` and `/v1/agents/{…}` segment, under all four
  // spellings the adapter uses for the same value (`id`, `agentId`,
  // `agentPath`, `agentSlugOrId`).
  {
    after: "agents",
    names: ["agentId", "agentPath", "agentSlugOrId"],
    discovery: "listAgents",
  },
  { after: "routines", names: ["routineId"], discovery: "listRoutines" },
  { after: "runs", names: ["runId"], discovery: "listRoutineRuns" },
  { after: "activities", discovery: "listActivities" },
  { after: "skills", discovery: "listSkills" },
  { after: "shared-skills", discovery: "listSharedSkills" },
  { after: "workspaces", names: ["workspaceId"], discovery: "listWorkspaces" },
  { after: "orgs", discovery: "listOrgs" },
  { after: "teams", names: ["teamId"], discovery: "listAgentTeams" },
  { after: "members", names: ["userId"], discovery: "getOrgPeople" },
  { after: "invites", names: ["inviteId"], discovery: "getOrgPeople" },
  { after: "org-invites", discovery: "getOrgPeople" },
  { after: "keys", discovery: "listApiKeys" },
  { after: "move", names: ["moveId"], discovery: "moveAgent" },
  {
    after: "definitions",
    discovery: "customIntegrations",
  },
  {
    after: "connections",
    names: ["connectionId"],
    discovery: "integrationConnections",
  },
  // The toolkit slug a trigger catalog is asked for: a query key, so the path
  // says nothing about it.
  { names: ["toolkit"], discovery: "integrationToolkits" },
  {
    names: ["relPath", "toDir"],
    pathContains: "/files",
    discovery: "listProjectFiles",
  },
];

/** The literal segment a `{placeholder}` follows, or null when it opens the path. */
function segmentBefore(path: string, parameter: string): string | null {
  const segments = path.split("/").filter(Boolean);
  const at = segments.indexOf(`{${parameter}}`);
  if (at <= 0) return null;
  const previous = segments[at - 1];
  return previous.startsWith("{") ? null : previous;
}

/**
 * The operation that lists what `parameter` accepts, or undefined.
 *
 * `route` is the operation's own extracted route: a parameter spliced into a
 * path segment is identified by the collection it follows, and one that only
 * reaches the wire in a body or a query string falls back to its name.
 */
export function entitySourceFor(
  parameter: string,
  route: AssistantRoute | null,
): string | undefined {
  const after = route ? segmentBefore(route.path, parameter) : null;
  if (after) {
    const byRoute = ENTITY_SOURCES.find((rule) => rule.after === after);
    if (byRoute) return byRoute.discovery;
  }
  const path = route?.path ?? "";
  const byName = ENTITY_SOURCES.find(
    (rule) =>
      rule.names?.includes(parameter) &&
      (!rule.pathContains || path.includes(rule.pathContains)),
  );
  return byName?.discovery;
}
