import type { EntityRule } from "./assistant-entity-rules.ts";

export const FIELD_SOURCES: readonly EntityRule[] = [
  {
    names: ["choice.provider", "input.provider", "updates.provider"],
    discovery: "listAgentProviders",
    unlisted:
      "AI providers are not directory entries, so read the id from listAgentProviders.",
  },
  {
    names: [
      "choice.model",
      "input.model",
      "updates.model",
      "settings.allowedModels",
    ],
    discovery: "listAgentProviders",
    unlisted:
      "A model belongs to its provider, so read the ids from listAgentProviders.",
  },
  {
    names: ["manifest.enabled"],
    discovery: "listSkills",
    collection: "skills",
  },
  {
    names: [
      "input.integrations",
      "updates.integrations",
      "settings.allowedToolkits",
    ],
    discovery: "integrationToolkits",
    unlisted:
      "Toolkits belong to the integration provider, so read the slugs from integrationToolkits.",
  },
  {
    names: ["assignments"],
    discovery: "getOrgPeople",
    collection: "members",
  },
  {
    names: ["input.agent"],
    discovery: "listAgents",
    unlisted:
      "The board is already addressed by its own agent parameter; this field only labels the row, so take the name from listAgents.",
  },
];
