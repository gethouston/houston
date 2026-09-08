import type { AssistantEntityCollection } from "@houston/domain/assistant-catalog-types";

/**
 * WHAT a parameter's value is, in one table.
 *
 * An identifier is never guessable. The catalog already says a parameter is a
 * string; what it could not say is that the string must be an agent that exists,
 * which operation would have listed it, and whether the host can check it
 * before the call leaves - so a model asked to rename an agent invented a slug
 * and the call 404'd with nothing to correct from. Each rule below answers all
 * three: the operation that enumerates the values (`discovery`), and either the
 * live `EntityDirectory` list the host resolves the value against
 * (`collection`) or the reason no live list backs it (`unlisted`).
 *
 * DECLARATIVE on purpose. The mapping is derived from the route the generator
 * already extracted - the literal segment a placeholder follows (`/agents/{x}`
 * -> an agent, `/routines/{x}` -> a routine) - so a new operation on an existing
 * collection is identified the day it is annotated, with nothing added here.
 * Only genuinely new collections, and the handful of body/query fields whose
 * route cannot say what they are, need a line.
 */

export interface EntityRule {
  /**
   * The literal path segment a placeholder must directly follow for this rule
   * to claim it. `/v1/org/teams/{teamId}` -> `teams`.
   */
  after?: string;
  /**
   * Parameter names this rule claims, matched against the parameter itself and
   * against the body key or query key that carries it - for the values a path
   * cannot describe.
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
  discovery?: string;
  /** The `EntityDirectory` list the host resolves the value against, live. */
  collection?: AssistantEntityCollection;
  /** Why no live list backs this identifier. Every rule states one or the other. */
  unlisted?: string;
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
    collection: "agents",
  },
  {
    after: "routines",
    names: ["routineId"],
    discovery: "listRoutines",
    collection: "routines",
  },
  {
    after: "runs",
    names: ["runId"],
    discovery: "listRoutineRuns",
    unlisted:
      "The directory lists routines, not their runs, so read the run id from listRoutineRuns.",
  },
  {
    after: "activities",
    discovery: "listActivities",
    collection: "activities",
  },
  { after: "skills", discovery: "listSkills", collection: "skills" },
  {
    after: "shared-skills",
    discovery: "listSharedSkills",
    collection: "shared-skills",
  },
  {
    after: "workspaces",
    names: ["workspaceId"],
    discovery: "listWorkspaces",
    collection: "workspaces",
  },
  {
    after: "orgs",
    names: ["toSlug"],
    discovery: "listOrgs",
    unlisted:
      "The directory covers one organization, so read another one's slug from listOrgs.",
  },
  {
    after: "teams",
    names: ["teamId"],
    discovery: "listAgentTeams",
    collection: "teams",
  },
  {
    after: "members",
    names: ["userId"],
    discovery: "getOrgPeople",
    collection: "members",
  },
  {
    after: "invites",
    names: ["inviteId"],
    discovery: "getOrgPeople",
    collection: "invites",
  },
  { after: "org-invites", discovery: "getOrgPeople", collection: "invites" },
  {
    after: "keys",
    discovery: "listApiKeys",
    unlisted: "API keys are secrets the directory never lists.",
  },
  {
    after: "move",
    names: ["moveId"],
    discovery: "moveAgent",
    unlisted: "A move receipt exists only in the answer moveAgent returned.",
  },
  {
    after: "definitions",
    discovery: "customIntegrations",
    unlisted:
      "The directory lists Houston's own things, so read a self-added app's slug from customIntegrations.",
  },
  {
    after: "connections",
    names: ["connectionId"],
    discovery: "integrationConnections",
    unlisted:
      "A connection lives with the integration provider, so read its id from integrationConnections.",
  },
  {
    names: ["source", "skillId"],
    pathContains: "/skills/community",
    discovery: "searchCommunitySkills",
    unlisted:
      "The community catalogue is outside Houston, so read both values from searchCommunitySkills.",
  },
  // The toolkit slug a trigger catalog is asked for: a query key, so the path
  // says nothing about it.
  {
    names: ["toolkit"],
    discovery: "integrationToolkits",
    unlisted:
      "Toolkits belong to the integration provider, so read the slug from integrationToolkits.",
  },
  {
    names: ["relPath", "toDir"],
    pathContains: "/files",
    discovery: "listProjectFiles",
    unlisted:
      "Files are not directory entries, so read the path from listProjectFiles.",
  },
  {
    names: ["relPath"],
    pathContains: "/agentfile",
    unlisted:
      "An agent document is addressed by its known name, and nothing lists them.",
  },
];
