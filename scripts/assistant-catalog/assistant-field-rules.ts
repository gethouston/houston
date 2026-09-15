import type { EntityRule } from "./assistant-entity-rules.ts";

/**
 * FIELDS INSIDE A BODY OBJECT, matched as `<parameter>.<field>` (the nested walk
 * offers the bare field name too, so a rule can claim either).
 *
 * Qualified on purpose: `provider` at the top level of the integration
 * operations is the app-integration provider, a different thing entirely from
 * the AI provider these pin. A bare rule would claim both.
 *
 * Kept beside the path rules rather than among them because they answer a
 * different question - the path says nothing about a body field, so the only
 * evidence here is the name and the parameter carrying it.
 */
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
    names: ["body.skills"],
    discovery: "listSkillsFromRepo",
    unlisted:
      "A repository's skills are outside Houston, so read their names from listSkillsFromRepo.",
  },
  // The people an agent is assigned to, as a LIST of user ids. The object form
  // of the same parameter carries `userId` per entry, which the nested walk
  // claims through the `userId` rule above.
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
