import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentReadFailures,
  allAgentReadsFailed,
  mergeAgentReadFailures,
} from "../src/lib/agent-read-failures.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string, name = id): Agent =>
  ({ id, name, folderPath: `/w/${id}` }) as Agent;

describe("agentReadFailures", () => {
  it("counts the agents that failed against the agents it tried", () => {
    const f = agentReadFailures([
      { agent: agent("a", "Ana"), error: null },
      { agent: agent("b", "Bo"), error: new Error("boom") },
      { agent: agent("c", "Cy"), error: null },
      { agent: agent("d", "Di"), error: new Error("boom") },
    ]);
    assert.equal(f.total, 4);
    assert.deepEqual(
      f.failed.map((a) => a.name),
      ["Bo", "Di"],
    );
  });

  it("is silent when every agent answered", () => {
    const f = agentReadFailures([
      { agent: agent("a"), error: null },
      { agent: agent("b"), error: undefined },
    ]);
    assert.deepEqual(f.failed, []);
  });

  it("keeps the caller's own order so the strip reads like the rail", () => {
    const f = agentReadFailures([
      { agent: agent("z", "Zoe"), error: new Error("x") },
      { agent: agent("a", "Ana"), error: new Error("x") },
    ]);
    assert.deepEqual(
      f.failed.map((a) => a.id),
      ["z", "a"],
    );
  });

  it("carries the folder path, so a retry can target only what failed", () => {
    const f = agentReadFailures([
      { agent: agent("b", "Bo"), error: new Error("x") },
    ]);
    assert.deepEqual(f.failed[0], {
      id: "b",
      name: "Bo",
      folderPath: "/w/b",
    });
  });
});

describe("mergeAgentReadFailures", () => {
  const boom = new Error("boom");

  it("names an agent once even when both of the section's reads failed", () => {
    const routines = agentReadFailures([
      { agent: agent("a", "Ana"), error: boom },
      { agent: agent("b", "Bo"), error: null },
    ]);
    const triggers = agentReadFailures([
      { agent: agent("a", "Ana"), error: boom },
      { agent: agent("b", "Bo"), error: boom },
    ]);
    const merged = mergeAgentReadFailures(routines, triggers);
    assert.deepEqual(
      merged.failed.map((f) => f.id),
      ["a", "b"],
    );
    assert.equal(merged.total, 2);
  });

  it("surfaces an agent whose routines arrived but whose triggers did not", () => {
    const merged = mergeAgentReadFailures(
      agentReadFailures([{ agent: agent("a", "Ana"), error: null }]),
      agentReadFailures([{ agent: agent("a", "Ana"), error: boom }]),
    );
    assert.deepEqual(
      merged.failed.map((f) => f.name),
      ["Ana"],
    );
  });

  it("stays silent when both reads answered, and counts the wider sweep", () => {
    const merged = mergeAgentReadFailures(
      agentReadFailures([
        { agent: agent("a"), error: null },
        { agent: agent("b"), error: null },
      ]),
      agentReadFailures([{ agent: agent("a"), error: null }]),
    );
    assert.deepEqual(merged.failed, []);
    assert.equal(merged.total, 2);
  });
});

describe("allAgentReadsFailed", () => {
  const boom = new Error("boom");

  it("is true only when NOTHING answered — the surface knows nothing", () => {
    assert.equal(
      allAgentReadsFailed(
        agentReadFailures([
          { agent: agent("a"), error: boom },
          { agent: agent("b"), error: boom },
        ]),
      ),
      true,
    );
  });

  it("is false while even one agent answered: that list is a real list", () => {
    // The strip still names the agent that failed, but "no routines" is now a
    // fact about the agents that DID answer, so the empty state may say it.
    assert.equal(
      allAgentReadsFailed(
        agentReadFailures([
          { agent: agent("a"), error: boom },
          { agent: agent("b"), error: null },
        ]),
      ),
      false,
    );
  });

  it("is false when every agent answered", () => {
    assert.equal(
      allAgentReadsFailed(
        agentReadFailures([{ agent: agent("a"), error: null }]),
      ),
      false,
    );
  });

  it("is false for an empty roster: nothing failed, so nothing is hidden", () => {
    // A team with no agents in scope has its own honest empty state; calling
    // that "we could not read them" would invent a failure.
    assert.equal(allAgentReadsFailed(agentReadFailures([])), false);
  });

  it("reads the MERGED set, so one agent short of the roster is enough", () => {
    // Two of the section's reads, three agents, and between them every agent
    // failed at least one — nobody in this team can be spoken for.
    const merged = mergeAgentReadFailures(
      agentReadFailures([
        { agent: agent("a"), error: boom },
        { agent: agent("b"), error: null },
        { agent: agent("c"), error: boom },
      ]),
      agentReadFailures([
        { agent: agent("a"), error: null },
        { agent: agent("b"), error: boom },
        { agent: agent("c"), error: null },
      ]),
    );
    assert.equal(merged.total, 3);
    assert.equal(allAgentReadsFailed(merged), true);
  });
});
