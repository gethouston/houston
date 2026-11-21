import type { AssistantEntityCollection } from "@houston/domain/assistant-catalog-types";
import { FIELD_SOURCES } from "./assistant-field-rules.ts";

export interface EntityRule {
  after?: string;
  names?: readonly string[];
  pathContains?: string;
  discovery?: string;
  collection?: AssistantEntityCollection;
  unlisted?: string;
}

export const ENTITY_SOURCES: readonly EntityRule[] = [
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
      "The directory lists the app's own things, so read a self-added app's slug from customIntegrations.",
  },
  {
    after: "connections",
    names: ["connectionId"],
    pathContains: "/channels",
    discovery: "getChannels",
    unlisted:
      "A messaging account is not a directory entry, so read its connection id from getChannels.",
  },
  {
    after: "connections",
    names: ["connectionId"],
    discovery: "integrationConnections",
    unlisted:
      "A connection lives with the integration provider, so read its id from integrationConnections.",
  },
  {
    after: "conversations",
    names: ["conversationId"],
    discovery: "conversations.list",
    unlisted:
      "A chat lives in the agent's own engine, not in the directory, so read its id from conversations.list.",
  },
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
  ...FIELD_SOURCES,
];
