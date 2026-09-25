import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_COLORS } from "@houston-ai/core";
import { nextFreeAgentColor } from "../src/lib/next-agent-color.ts";

const ids = AGENT_COLORS.map((c) => c.id);

describe("nextFreeAgentColor", () => {
  it("starts the palette for the first hire", () => {
    assert.equal(nextFreeAgentColor([]), ids[0]);
  });

  it("skips colors a teammate already wears, by id or by hex", () => {
    assert.equal(nextFreeAgentColor([ids[0]]), ids[1]);
    assert.equal(
      nextFreeAgentColor([AGENT_COLORS[0].light, AGENT_COLORS[1].dark]),
      ids[2],
    );
  });

  it("ignores colors outside the palette and missing ones", () => {
    assert.equal(nextFreeAgentColor(["#123456", undefined]), ids[0]);
  });

  it("reuses the least worn color once every one is taken", () => {
    const everyOnce = [...ids];
    assert.equal(nextFreeAgentColor(everyOnce), ids[0]);
    assert.equal(nextFreeAgentColor([...everyOnce, ids[0]]), ids[1]);
  });
});
