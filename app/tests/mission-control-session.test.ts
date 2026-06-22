import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  missionControlAgentPathForSession,
  missionControlSessionKey,
  missionControlSessionKeyForId,
} from "../src/components/mission-control-session.ts";

const items = [
  {
    id: "normal",
    metadata: {
      agentPath: "/agents/Ada",
      sessionKey: "activity-normal",
    },
  },
  {
    id: "routine-activity-row",
    metadata: {
      agentPath: "/agents/Grace",
      sessionKey: "routine-morning-digest",
    },
  },
  {
    id: "legacy",
    metadata: {
      agentPath: "/agents/Legacy",
    },
  },
];

describe("Mission Control session key resolution", () => {
  it("uses the stored session key for routine activity rows", () => {
    strictEqual(missionControlSessionKey(items[1]), "routine-morning-digest");
    strictEqual(
      missionControlSessionKeyForId(items, "routine-activity-row"),
      "routine-morning-digest",
    );
  });

  it("falls back to activity-{id} for legacy rows", () => {
    strictEqual(missionControlSessionKey(items[2]), "activity-legacy");
    strictEqual(
      missionControlSessionKeyForId(items, "missing"),
      "activity-missing",
    );
  });

  it("resolves the agent path from the active chat session key", () => {
    strictEqual(
      missionControlAgentPathForSession(items, "routine-morning-digest"),
      "/agents/Grace",
    );
    strictEqual(
      missionControlAgentPathForSession(items, "activity-normal"),
      "/agents/Ada",
    );
    strictEqual(
      missionControlAgentPathForSession(items, "activity-legacy"),
      "/agents/Legacy",
    );
    strictEqual(
      missionControlAgentPathForSession(items, "activity-missing"),
      undefined,
    );
  });
});
