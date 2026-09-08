import type {
  AssistantOperation,
  AssistantOperationParam,
} from "@houston/host/src/assistant/catalog";
import { Type } from "typebox";
import { describe, expect, test } from "vitest";
import {
  choiceGuidance,
  describeOperation,
  resolutionGuidance,
  sourceGuidance,
} from "./assistant-describe";

const op = (params: AssistantOperationParam[]): AssistantOperation => ({
  name: "deleteSkill",
  group: "skills",
  description: "Deletes a skill so the agent no longer has it.",
  confirm: false,
  hidden: false,
  params,
  returns: Type.Null(),
  route: {
    method: "DELETE",
    path: "/agents/{agentId}/skills/{slug}",
    pathParams: [
      { name: "agentId", encoding: "segment" },
      { name: "slug", encoding: "segment" },
    ],
    query: {},
    body: null,
    bodyFields: null,
  },
});

const AGENT_ID: AssistantOperationParam = {
  name: "agentId",
  required: true,
  schema: Type.String(),
  description: "The agent this acts on, by the id listAgents returns.",
  source: "listAgents",
};
const SLUG: AssistantOperationParam = {
  name: "slug",
  required: true,
  schema: Type.String(),
  source: "listSkills",
};
const TEAM_ID: AssistantOperationParam = {
  name: "teamId",
  required: true,
  schema: Type.String(),
  source: "listAgentTeams",
  resolver: "teams",
};
const COLOR: AssistantOperationParam = {
  name: "color",
  required: true,
  schema: Type.Union([Type.Literal("navy"), Type.Literal("teal")]),
};
const TEXT: AssistantOperationParam = {
  name: "content",
  required: true,
  schema: Type.String(),
};

describe("sourceGuidance", () => {
  test("names every parameter's discovery operation", () => {
    expect(sourceGuidance(op([AGENT_ID, SLUG]))).toContain(
      '"agentId" from listAgents, "slug" from listSkills',
    );
    expect(sourceGuidance(op([AGENT_ID, SLUG]))).toContain(
      "Never invent an identifier",
    );
  });

  test("says nothing for an operation whose values are all free text", () => {
    expect(sourceGuidance(op([TEXT]))).toBe("");
  });

  test("leaves out what Houston resolves, so no lookup call is asked for", () => {
    expect(sourceGuidance(op([TEAM_ID, SLUG]))).toContain(
      '"slug" from listSkills',
    );
    expect(sourceGuidance(op([TEAM_ID, SLUG]))).not.toContain("teamId");
    expect(sourceGuidance(op([TEAM_ID]))).toBe("");
  });
});

describe("resolutionGuidance", () => {
  test("says a resolved parameter takes the id or the exact name", () => {
    const text = resolutionGuidance(op([TEAM_ID, SLUG]));
    expect(text).toContain('Houston resolves "teamId" against what exists');
    expect(text).toContain("pass the id, or the exact name the user gave you");
    expect(text).toContain("refused with the ones that do");
  });

  test("says nothing when Houston resolves none of the parameters", () => {
    expect(resolutionGuidance(op([AGENT_ID, TEXT]))).toBe("");
  });
});

describe("choiceGuidance", () => {
  test("spells out a closed set inline so no lookup is needed", () => {
    expect(choiceGuidance(op([COLOR]))).toContain(
      '"color" is one of: navy, teal',
    );
  });

  test("says nothing when no parameter is a closed set", () => {
    expect(choiceGuidance(op([AGENT_ID, TEXT]))).toBe("");
  });
});

describe("describeOperation", () => {
  test("renders each parameter with its sentence and where its values live", () => {
    const text = describeOperation(op([AGENT_ID, SLUG]));
    const contract = JSON.parse(text.split("\n\n")[0]) as {
      params: { name: string; description?: string; valuesFrom?: string }[];
    };
    expect(contract.params).toEqual([
      {
        name: "agentId",
        required: true,
        description: "The agent this acts on, by the id listAgents returns.",
        valuesFrom: "listAgents",
        schema: { type: "string" },
      },
      {
        name: "slug",
        required: true,
        valuesFrom: "listSkills",
        schema: { type: "string" },
      },
    ]);
    expect(text).toContain(
      "Pass these to houston_call keyed by parameter name.",
    );
    expect(text).toContain('"agentId" from listAgents');
  });

  test("still tells a confirm operation to wait for the user's card", () => {
    const text = describeOperation({ ...op([AGENT_ID]), confirm: true });
    expect(text).toContain("ERROR needs_confirmation");
  });
});
