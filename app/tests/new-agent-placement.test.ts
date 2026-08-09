import assert from "node:assert/strict";
import test from "node:test";
import { newAgentPlacement } from "../src/lib/new-agent-placement.ts";

test("targets server and local teams, while default needs no move", () => {
  assert.deepEqual(newAgentPlacement(null, true), { kind: "default" });
  assert.deepEqual(newAgentPlacement("team-1", true), {
    kind: "server",
    teamId: "team-1",
  });
  assert.deepEqual(newAgentPlacement("group-1", false), {
    kind: "local",
    groupId: "group-1",
  });
});
