import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import { turnMissionGuidance } from "./turn-mission-tools";
import type { TurnSessionRequest } from "./turn-session";
import { buildTurnCommonTools, buildTurnToolSelection } from "./turn-toolset";

const FAMILY = [
  "start_mission",
  "list_missions",
  "read_mission",
  "update_mission_status",
  "list_agents",
  "read_agent",
];

function turn(
  sandbox: TurnSessionRequest["sandbox"],
  overrides: Partial<TurnSessionRequest> = {},
): TurnSessionRequest {
  return {
    conversationId: "c1",
    text: "hello",
    provider: "openai-codex",
    emit: () => undefined,
    signal: undefined,
    turnId: "t1",
    grant: { scopes: ["integrations", "agent-writes"] },
    ...(sandbox ? { sandbox } : {}),
    ...overrides,
  };
}

const dataDir = () => mkdtempSync(join(tmpdir(), "turn-mission-tools-"));
const names = (tools: { name: string }[]) => tools.map((tool) => tool.name);
const okCall: SandboxFetch = async () => Response.json({});

test("an ordinary turn with the mission family mounted offers and registers it", async () => {
  const mounted = turn({
    call: okCall,
    missionGuidance: Promise.resolve("full"),
  });
  const selected = buildTurnToolSelection(mounted, "local").toolNames;
  const registered = names(buildTurnCommonTools(mounted, null, dataDir()));
  for (const name of FAMILY) {
    expect(selected).toContain(name);
    expect(registered).toContain(name);
  }
  expect(registered).not.toContain("houston_call");
  expect(await turnMissionGuidance(mounted)).toBe("full");
});

test("a turn without the family is neither offered it nor told about it", async () => {
  for (const bare of [turn({ call: okCall }), turn(undefined)]) {
    const selected = buildTurnToolSelection(bare, "local").toolNames;
    const registered = names(buildTurnCommonTools(bare, null, dataDir()));
    for (const name of FAMILY) {
      expect(selected).not.toContain(name);
      expect(registered).not.toContain(name);
    }
    expect(await turnMissionGuidance(bare)).toBe("none");
  }
});

test("a nested mission keeps the family and says it cannot start more", async () => {
  const nested = turn({
    call: okCall,
    missionGuidance: Promise.resolve("nested"),
  });
  expect(buildTurnToolSelection(nested, "local").toolNames).toContain(
    "start_mission",
  );
  expect(await turnMissionGuidance(nested)).toBe("nested");
});

test("read_mission on an ordinary turn reads its own board through the facade", async () => {
  const seen: string[] = [];
  const call: SandboxFetch = async (path) => {
    seen.push(path);
    return Response.json({
      id: "m1",
      status: "needs_you",
      title: "Mission",
      totalMessages: 1,
      messages: [{ role: "assistant", content: "all done" }],
    });
  };
  const mounted = turn({ call, missionGuidance: Promise.resolve("full") });
  const read = buildTurnCommonTools(mounted, null, dataDir()).find(
    (tool) => tool.name === "read_mission",
  );
  if (!read) throw new Error("read_mission is not registered");
  const result = await read.execute(
    "call-1",
    { id: "m1" },
    undefined,
    undefined,
    undefined as never,
  );
  expect(seen).toEqual(["/sandbox/missions/read?id=m1&limit=20"]);
  expect(JSON.stringify(result.content)).toContain("all done");
});
