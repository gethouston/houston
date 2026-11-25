import { expect, test } from "vitest";
import { resolveMissionGateway } from "./agent-caller-wiring";
import { ownBoardViaGateway } from "./missions-own-board";
import type { MissionsCtx } from "./missions-sandbox";
import type { MissionRoute } from "./missions-target";

const gateway = { url: "https://gw.test", token: "turn-v1.p.s" };

function ctx(agentId: string, pooled: boolean): MissionsCtx {
  return {
    deps: {
      store: {} as MissionsCtx["deps"]["store"],
      channels: {},
      gatewayFronted: true,
      ...(pooled ? { pooledTurn: { gateway, agentSlug: "slug-1" } } : {}),
    },
    ws: { id: "Personal", name: "Personal" },
    agent: { id: agentId, name: "Agent" },
    actingAs: "acting-v1.p.s",
  } as unknown as MissionsCtx;
}

const local = (target: MissionsCtx): MissionRoute => ({
  ok: true,
  remote: false,
  ctx: target,
});

test("a pooled turn's own board is reached through the gateway as itself", () => {
  const caller = ctx("Personal/Agent", true);
  const route = ownBoardViaGateway(caller, local(caller));
  expect(route).toEqual({
    ok: true,
    remote: true,
    route: {
      target: {
        remote: true,
        id: "slug-1",
        name: "Agent",
        workspace: "Personal",
        workspaceId: "Personal",
      },
      gateway,
      actingAs: "acting-v1.p.s",
    },
  });
});

test("a host that holds its board keeps it local, and another agent's route is untouched", () => {
  const desktop = ctx("Personal/Agent", false);
  expect(ownBoardViaGateway(desktop, local(desktop))).toEqual(local(desktop));
  const caller = ctx("Personal/Agent", true);
  const other = ctx("Personal/Other", true);
  expect(ownBoardViaGateway(caller, local(other))).toEqual(local(other));
  const refused: MissionRoute = {
    ok: false,
    status: 404,
    code: "agent_not_found",
    error: "no",
  };
  expect(ownBoardViaGateway(caller, refused)).toBe(refused);
});

test("a pooled turn reaches other agents with its own gateway, never the process env", () => {
  const env = {
    HOUSTON_INTEGRATIONS_URL: "https://env.test",
    HOUSTON_HOST_TOKEN: "a".repeat(64),
  };
  expect(resolveMissionGateway(ctx("Personal/Agent", true), env)).toEqual({
    ok: true,
    value: { gateway, actingAs: "acting-v1.p.s", kind: "agent-caller" },
  });
  const anonymous = { ...ctx("Personal/Agent", true), actingAs: undefined };
  expect(resolveMissionGateway(anonymous, env)).toEqual({
    ok: false,
    code: "no_acting_person",
  });
});
