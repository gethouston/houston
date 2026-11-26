import { describe, expect, test } from "vitest";
import {
  DEFAULT_AGENT_DELEGATION,
  isAgentDelegationRefusalCode,
  MAX_DELEGATION_AGENTS,
  parseAgentDelegation,
} from "./delegation";

const selfId = "Personal/Scout";

describe("parseAgentDelegation", () => {
  test.each(["all", "picked", "off"] as const)(
    "accepts %s with an empty agent list",
    (mode) => {
      expect(
        parseAgentDelegation(
          { mode, agents: [], acceptsMissions: true },
          selfId,
        ),
      ).toEqual({
        ok: true,
        value: { mode, agents: [], acceptsMissions: true },
      });
    },
  );

  test("accepts picked agents and a disabled incoming switch", () => {
    expect(
      parseAgentDelegation(
        { mode: "picked", agents: ["Personal/Writer"], acceptsMissions: false },
        selfId,
      ),
    ).toEqual({
      ok: true,
      value: {
        mode: "picked",
        agents: ["Personal/Writer"],
        acceptsMissions: false,
      },
    });
  });

  test("deduplicates picked agents in their original order", () => {
    const result = parseAgentDelegation(
      {
        mode: "picked",
        agents: ["Personal/Writer", "Personal/Researcher", "Personal/Writer"],
        acceptsMissions: true,
      },
      selfId,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        mode: "picked",
        agents: ["Personal/Writer", "Personal/Researcher"],
        acceptsMissions: true,
      },
    });
  });

  test("uses the default on-state", () => {
    expect(DEFAULT_AGENT_DELEGATION).toEqual({
      mode: "all",
      agents: [],
      acceptsMissions: true,
    });
  });

  test("rejects an unknown mode", () => {
    expect(
      parseAgentDelegation(
        { mode: "some", agents: [], acceptsMissions: true },
        selfId,
      ),
    ).toMatchObject({ ok: false, code: "invalid_delegation_mode" });
  });

  test.each([
    { mode: "picked", agents: "Personal/Writer", acceptsMissions: true },
    { mode: "all", agents: ["Personal/Writer"], acceptsMissions: true },
    { mode: "off", agents: ["Personal/Writer"], acceptsMissions: true },
    { mode: "picked", agents: [selfId], acceptsMissions: true },
    { mode: "picked", agents: [""], acceptsMissions: true },
    { mode: "picked", agents: [], acceptsMissions: "yes" },
    { mode: "picked", agents: [] },
    { mode: "picked", agents: [], acceptsMissions: true, extra: true },
  ])("rejects an invalid policy shape %#", (body) => {
    expect(parseAgentDelegation(body, selfId)).toMatchObject({
      ok: false,
      code: "invalid_delegation_agents",
    });
  });

  test("enforces the 200 agent cap before deduplication", () => {
    expect(
      parseAgentDelegation(
        {
          mode: "picked",
          agents: Array(MAX_DELEGATION_AGENTS + 1).fill("Personal/Writer"),
          acceptsMissions: true,
        },
        selfId,
      ),
    ).toMatchObject({ ok: false, code: "too_many_agents" });
  });
});

test("delegation refusal guard recognizes only enforcement codes", () => {
  expect(isAgentDelegationRefusalCode("delegation_off")).toBe(true);
  expect(isAgentDelegationRefusalCode("unknown_agent")).toBe(false);
  expect(isAgentDelegationRefusalCode(null)).toBe(false);
});
