import { describe, expect, it } from "vitest";
import type { AssistantRoute } from "../scripts/assistant-catalog-types.ts";
import { entitySourceFor } from "../scripts/assistant-entity-sources.ts";
import { parseAssistantDocs } from "../scripts/assistant-jsdoc.ts";
import { route } from "./assistant-catalog-support.ts";

/**
 * The two halves of "never guess an identifier": the author's sentence about a
 * parameter, and the operation that lists what it accepts. Both are derived,
 * so both are pinned here rather than left to the drift check, which only
 * proves the generated file matches whatever the rules currently produce.
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
