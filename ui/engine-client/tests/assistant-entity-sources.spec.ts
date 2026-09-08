import { describe, expect, it } from "vitest";
import type { AssistantRoute } from "../scripts/assistant-catalog-types.ts";
import { ENTITY_SOURCES } from "../scripts/assistant-entity-rules.ts";
import {
  entityRuleFor,
  entitySourceFor,
  namesEntity,
} from "../scripts/assistant-entity-sources.ts";
import { parseAssistantDocs } from "../scripts/assistant-jsdoc.ts";
import { route } from "./assistant-catalog-support.ts";

/**
 * "Never guess an identifier", in three derived halves: the author's sentence
 * about a parameter, the operation that lists what it accepts, and the live
 * list the host resolves it against. All three are derived, so all three are
 * pinned here rather than left to the drift check, which only proves the
 * generated file matches whatever the rules currently produce.
 */

const at = (path: string, extra: Partial<AssistantRoute> = {}) =>
  route(path, extra) as AssistantRoute;

describe("entitySourceFor", () => {
  it("reads the collection a path placeholder belongs to", () => {
    const cases: [string, string, string][] = [
      ["/agents/{id}", "id", "listAgents"],
      ["/v1/agents/{agentSlugOrId}/move", "agentSlugOrId", "listAgents"],
      ["/agents/{agentPath}/files", "agentPath", "listAgents"],
      ["/agents/{agentId}/routines/{id}", "id", "listRoutines"],
      ["/agents/{agentId}/skills/{slug}", "slug", "listSkills"],
      [
        "/v1/workspaces/{workspaceId}/shared-skills/{slug}",
        "slug",
        "listSharedSkills",
      ],
      [
        "/v1/workspaces/{workspaceId}/sidebar-layout",
        "workspaceId",
        "listWorkspaces",
      ],
      ["/v1/org/teams/{teamId}/members/{userId}", "userId", "getOrgPeople"],
      ["/v1/org/teams/{teamId}", "teamId", "listAgentTeams"],
      ["/v1/orgs/{slug}", "slug", "listOrgs"],
      ["/v1/keys/{id}", "id", "listApiKeys"],
      ["/v1/agents/{agentSlugOrId}/move/{moveId}", "moveId", "moveAgent"],
      [
        "/agents/{agentId}/routines/{routineId}/runs/{runId}/cancel",
        "runId",
        "listRoutineRuns",
      ],
      [
        "/v1/integrations/{provider}/connections/{connectionId}",
        "connectionId",
        "integrationConnections",
      ],
      [
        "/v1/integrations/custom/definitions/{slug}/tools",
        "slug",
        "customIntegrations",
      ],
    ];
    for (const [path, parameter, expected] of cases) {
      expect(entitySourceFor(parameter, at(path))).toBe(expected);
    }
  });

  it("falls back to the parameter name for a body or query value", () => {
    expect(entitySourceFor("agentId", at("/v1/things"))).toBe("listAgents");
    expect(
      entitySourceFor("toolkit", at("/v1/integrations/composio/trigger-types")),
    ).toBe("integrationToolkits");
  });

  it("reads a relative path by the collection its route addresses", () => {
    expect(
      entitySourceFor("relPath", at("/agents/{agentPath}/files/read")),
    ).toBe("listProjectFiles");
    // Nothing enumerates an agent's `.houston` documents, so the same spelling
    // under `/agentfile` is deliberately left without a source.
    expect(
      entitySourceFor("relPath", at("/agents/{agentId}/agentfile/{relPath}")),
    ).toBeUndefined();
  });

  it("claims nothing for free text or an unknown collection", () => {
    expect(entitySourceFor("name", at("/agents"))).toBeUndefined();
    expect(entitySourceFor("days", at("/v1/org/usage"))).toBeUndefined();
    expect(entitySourceFor("id", null)).toBeUndefined();
  });
});

describe("@param extraction", () => {
  const block = `/**
 * Deletes a skill so the agent no longer has it.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @assistant group:skills confirm
 */`;

  it("keeps the description and reads every @param, wrapping included", () => {
    const docs = parseAssistantDocs(block);
    expect(docs.description).toBe(
      "Deletes a skill so the agent no longer has it.",
    );
    expect(docs.params).toEqual({
      agentId:
        "The agent this acts on, by the id listAgents returns. An agent's name is not its id, so read the id from listAgents first.",
      slug: "The skill's exact slug, from listSkills. Never invent one.",
    });
    expect(docs.group).toBe("skills");
    expect(docs.confirm).toBe(true);
    expect(docs.unknownTags).toEqual([]);
  });

  it("a @param never bleeds into the next tag, and a block without one is empty", () => {
    expect(
      parseAssistantDocs(`/**
 * Lists things.
 * @param id The thing.
 * @assistant group:agents
 */`).params,
    ).toEqual({ id: "The thing." });
    expect(parseAssistantDocs("/** Lists things. */").params).toEqual({});
    expect(parseAssistantDocs().params).toEqual({});
  });
});

describe("entityRuleFor", () => {
  it("hands the host the live list each collection resolves against", () => {
    const cases: [string, string, string][] = [
      ["/agents/{id}", "id", "agents"],
      ["/v1/org/teams/{teamId}", "teamId", "teams"],
      ["/v1/org/teams/{teamId}/members/{userId}", "userId", "members"],
      ["/v1/org/invites/{inviteId}", "inviteId", "invites"],
      ["/v1/org-invites/{inviteId}/accept", "inviteId", "invites"],
      [
        "/v1/workspaces/{workspaceId}/shared-skills",
        "workspaceId",
        "workspaces",
      ],
      [
        "/v1/workspaces/{workspaceId}/shared-skills/{slug}",
        "slug",
        "shared-skills",
      ],
      ["/agents/{agentId}/routines/{id}", "id", "routines"],
      ["/agents/{agentId}/skills/{slug}", "slug", "skills"],
      ["/agents/{agentId}/activities/{id}", "id", "activities"],
    ];
    for (const [path, parameter, collection] of cases)
      expect(entityRuleFor(parameter, at(path))?.collection).toBe(collection);
  });

  it("states why an identifier no live list covers stays open", () => {
    const cases: [string, string][] = [
      ["/agents/{a}/routines/{r}/runs/{runId}/cancel", "runId"],
      ["/v1/agents/{agentSlugOrId}/move/{moveId}", "moveId"],
      [
        "/v1/integrations/{provider}/connections/{connectionId}",
        "connectionId",
      ],
      ["/v1/integrations/custom/definitions/{slug}", "slug"],
      ["/agents/{agentId}/agentfile/{relPath}", "relPath"],
    ];
    for (const [path, parameter] of cases) {
      const rule = entityRuleFor(parameter, at(path));
      expect(rule?.collection).toBeUndefined();
      expect(rule?.unlisted).toMatch(/\S/);
    }
  });

  it("claims a value by the body key or query key that carries it", () => {
    expect(
      entityRuleFor(
        "target",
        at("/v1/things", { bodyFields: { teamId: "target" } }),
      )?.collection,
    ).toBe("teams");
    expect(
      entityRuleFor("who", at("/v1/things", { query: { userId: "who" } }))
        ?.collection,
    ).toBe("members");
  });

  it("sources both identifiers in a community preview from the external catalog", () => {
    const preview = at("/agents/{agentId}/skills/community/preview");
    expect(entitySourceFor("source", preview)).toBe("searchCommunitySkills");
    expect(entitySourceFor("skillId", preview)).toBe("searchCommunitySkills");
    expect(entityRuleFor("skillId", preview)?.collection).toBeUndefined();
  });

  it("every rule either resolves its values or says why it cannot", () => {
    for (const rule of ENTITY_SOURCES)
      expect([rule.collection, rule.unlisted].filter(Boolean)).toHaveLength(1);
  });
});

describe("namesEntity", () => {
  it("reads an identifier from its spelling or from its path segment", () => {
    expect(namesEntity("teamId", null)).toBe(true);
    expect(namesEntity("toSlug", null)).toBe(true);
    expect(namesEntity("ids", null)).toBe(true);
    expect(
      namesEntity("relPath", at("/agents/{agentId}/agentfile/{relPath}")),
    ).toBe(true);
    expect(
      namesEntity("who", at("/v1/things", { query: { userId: "who" } })),
    ).toBe(true);
  });

  it("leaves free text alone", () => {
    for (const name of ["name", "content", "query", "days", "email", "toDir"])
      expect(namesEntity(name, at("/v1/things"))).toBe(false);
  });
});
