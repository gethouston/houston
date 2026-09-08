import type { AssistantEntityCollection } from "@houston/domain/assistant-catalog-types";
import { Type } from "typebox";
import { describe, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { ReachableAgent } from "../routes/reachable-agents";
import type {
  AssistantOperation,
  AssistantOperationParam,
  AssistantRoute,
} from "./catalog";
import {
  type EntityResolutionDeps,
  resolveEntityParams,
} from "./entity-resolution";

/**
 * FIXTURE operations, never the generated catalog: these pin the resolution and
 * the refusals, which must not move when the adapter's operations do. Which
 * parameter carries which `resolver` is the generator's half of the contract
 * (ui/engine-client/tests/assistant-entity-sources.spec.ts); here it is stated
 * on the fixture, exactly as the catalog states it on a real operation.
 */

const workspace = (id: string, name: string): Workspace => ({
  id,
  ownerUserId: "u1",
  kind: "personal",
  name,
  slug: name.toLowerCase(),
  runtime: "local",
  createdAt: 0,
});

const agent = (id: string, workspaceId: string, name: string): Agent => ({
  id,
  workspaceId,
  name,
  createdAt: 0,
});

const HOME = workspace("ws-home", "Home");
const WORK = workspace("ws-work", "Work");

const REACHABLE: ReachableAgent[] = [
  { workspace: HOME, agent: agent("a-marketing", "ws-home", "Marketing") },
  { workspace: HOME, agent: agent("a-legal", "ws-home", "Legal") },
  { workspace: WORK, agent: agent("a-marketing-2", "ws-work", "Marketing") },
];

const deps = (agents: readonly ReachableAgent[] = REACHABLE) =>
  ({
    agents: async () => agents,
    teams: async () => [],
    workspaces: async () => [],
    members: async () => [],
    invites: async () => [],
    routines: async () => [],
    skills: async () => [],
    sharedSkills: async () => [],
    activities: async () => [],
  }) satisfies EntityResolutionDeps;

/** A parameter, optionally naming the live list its value is resolved against. */
type ParamSpec = string | [string, AssistantEntityCollection];

const param = (spec: ParamSpec): AssistantOperationParam => ({
  name: typeof spec === "string" ? spec : spec[0],
  required: true,
  schema: Type.String(),
  ...(typeof spec === "string" ? {} : { resolver: spec[1] }),
});

const route = (
  path: string,
  extra: Partial<AssistantRoute> = {},
): AssistantRoute => ({
  method: "GET",
  path,
  pathParams: [],
  query: {},
  body: null,
  bodyFields: null,
  ...extra,
});

const operation = (
  name: string,
  params: ParamSpec[],
  routed: AssistantRoute | null = null,
): AssistantOperation => ({
  name,
  group: "agents",
  description: name,
  confirm: false,
  hidden: false,
  params: params.map(param),
  returns: Type.Unknown(),
  route: routed,
});

describe("resolveEntityParams", () => {
  const deleteAgent = operation(
    "deleteAgent",
    [["id", "agents"]],
    route("/agents/{id}"),
  );
  const writeAgentFile = operation(
    "writeAgentFile",
    [["agentId", "agents"], "relPath", "content"],
    route("/agents/{agentId}/agentfile/{relPath}"),
  );

  test("passes an operation that names no agent through untouched", async () => {
    const listAgents = operation("listAgents", [], route("/agents"));
    const params = { q: "x" };
    const out = await resolveEntityParams(listAgents, params, deps());
    expect(out).toEqual({ ok: true, params });
  });

  test("resolves an id, an exact name and a Workspace/Agent path to the id", async () => {
    for (const ref of [
      "a-legal",
      "Legal",
      "legal",
      "Home/Legal",
      "ws-home/Legal",
    ]) {
      const out = await resolveEntityParams(deleteAgent, { id: ref }, deps());
      expect(out).toEqual({ ok: true, params: { id: "a-legal" } });
    }
  });

  test("resolves every agent-naming parameter and leaves the rest alone", async () => {
    const out = await resolveEntityParams(
      writeAgentFile,
      { agentId: "Legal", relPath: "notes.md", content: "hi" },
      deps(),
    );
    expect(out).toEqual({
      ok: true,
      params: { agentId: "a-legal", relPath: "notes.md", content: "hi" },
    });
  });

  test("does not mutate the caller's params", async () => {
    const params = { id: "Legal" };
    await resolveEntityParams(deleteAgent, params, deps());
    expect(params).toEqual({ id: "Legal" });
  });

  test("refuses an unknown name and lists every reachable agent", async () => {
    const out = await resolveEntityParams(deleteAgent, { id: "Sales" }, deps());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("unknown_agent");
    expect(out.message).toContain("Marketing (id a-marketing, in Home)");
    expect(out.message).toContain("Legal (id a-legal, in Home)");
    expect(out.message).toContain("Marketing (id a-marketing-2, in Work)");
  });

  test("refuses an unknown name with no agents at all, and says so", async () => {
    const out = await resolveEntityParams(
      deleteAgent,
      { id: "Sales" },
      deps([]),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("unknown_agent");
    expect(out.message).toContain("no agents yet");
  });

  test("refuses an ambiguous bare name and lists the qualified spellings", async () => {
    const out = await resolveEntityParams(
      deleteAgent,
      { id: "Marketing" },
      deps(),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("ambiguous_agent");
    expect(out.message).toContain("Home/Marketing (id a-marketing)");
    expect(out.message).toContain("Work/Marketing (id a-marketing-2)");
  });

  test("a qualified name disambiguates what the bare name could not", async () => {
    const out = await resolveEntityParams(
      deleteAgent,
      { id: "Work/Marketing" },
      deps(),
    );
    expect(out).toEqual({ ok: true, params: { id: "a-marketing-2" } });
  });

  test("never resolves the assistant's own hidden agent", async () => {
    // `.assistant` is absent from the reachable set by construction, so both
    // its name and its id read as an agent that does not exist.
    for (const ref of [".assistant", "a-assistant"]) {
      const out = await resolveEntityParams(deleteAgent, { id: ref }, deps());
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("unknown_agent");
    }
  });

  test("refuses a non-string or blank reference before it reaches the wire", async () => {
    for (const bad of [42, "", "   ", { id: "x" }]) {
      const out = await resolveEntityParams(deleteAgent, { id: bad }, deps());
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("invalid_params");
    }
  });

  test("leaves an omitted optional agent reference absent", async () => {
    const out = await resolveEntityParams(
      writeAgentFile,
      { relPath: "notes.md", content: "hi" },
      deps(),
    );
    expect(out).toEqual({
      ok: true,
      params: { relPath: "notes.md", content: "hi" },
    });
  });
});

const directory = () => ({
  ...deps(),
  teams: async () => [{ id: "t1", name: "Design" }],
  workspaces: async () => [{ id: "w1", name: "Studio" }],
  members: async () => [
    { userId: "u1", name: "Jules", email: "jules@test.dev" },
  ],
  invites: async () => [{ id: "i1", email: "invite@test.dev" }],
  routines: async (agentId: string) => {
    expect(agentId).toBe("a-legal");
    return [{ id: "r1", name: "Daily" }];
  },
  skills: async (agentId: string) => {
    expect(agentId).toBe("a-legal");
    return [{ slug: "draft", name: "Drafting" }];
  },
  sharedSkills: async (workspaceId: string) => {
    expect(workspaceId).toBe("w1");
    return [{ slug: "shared", name: "Shared Drafting" }];
  },
  activities: async (agentId: string) => {
    expect(agentId).toBe("a-legal");
    return [{ id: "m1", name: "Review" }];
  },
});

describe("every collection resolves against its live list", () => {
  test.each<[string, ParamSpec[], Record<string, unknown>, unknown]>([
    [
      "a team and a person, by name and by address",
      [
        ["teamId", "teams"],
        ["userId", "members"],
      ],
      { teamId: "design", userId: "JULES@test.dev" },
      { teamId: "t1", userId: "u1" },
    ],
    [
      "an invite, by the address it was sent to",
      [["inviteId", "invites"]],
      { inviteId: "INVITE@test.dev" },
      { inviteId: "i1" },
    ],
    [
      "a routine, under the agent that owns it",
      [
        ["id", "routines"],
        ["agentId", "agents"],
      ],
      { agentId: "Legal", id: "daily" },
      { agentId: "a-legal", id: "r1" },
    ],
    [
      "a skill, by its title",
      [
        ["slug", "skills"],
        ["agentId", "agents"],
      ],
      { agentId: "Legal", slug: "Drafting" },
      { agentId: "a-legal", slug: "draft" },
    ],
    [
      "a mission on the agent's board",
      [
        ["id", "activities"],
        ["agentId", "agents"],
      ],
      { agentId: "Legal", id: "Review" },
      { agentId: "a-legal", id: "m1" },
    ],
    [
      "a shared skill, under its workspace",
      [
        ["slug", "shared-skills"],
        ["workspaceId", "workspaces"],
      ],
      { workspaceId: "Studio", slug: "Shared Drafting" },
      { workspaceId: "w1", slug: "shared" },
    ],
  ])("resolves %s", async (_label, params, given, expected) => {
    const op = operation("fixture", params, null);
    expect(await resolveEntityParams(op, given, directory())).toEqual({
      ok: true,
      params: expected,
    });
  });

  test("refuses a child whose parent scope was not given", async () => {
    const op = operation("loadSkill", [["slug", "skills"]], null);
    const out = await resolveEntityParams(op, { slug: "draft" }, directory());
    expect(out).toEqual({
      ok: false,
      code: "invalid_params",
      message: '"slug" requires a resolved agents scope.',
    });
  });

  test("rejects an unknown name with the complete accepted list", async () => {
    const op = operation("fixture", [["teamId", "teams"]], null);
    const out = await resolveEntityParams(
      op,
      { teamId: "guessed" },
      directory(),
    );
    expect(out).toMatchObject({ ok: false, code: "unknown_entity" });
    if (!out.ok) expect(out.message).toContain("Design (id t1)");
  });

  test("says so when the list is empty rather than accepting the guess", async () => {
    const op = operation("fixture", [["teamId", "teams"]], null);
    const out = await resolveEntityParams(op, { teamId: "Design" }, deps());
    expect(out).toMatchObject({ ok: false, code: "unknown_entity" });
    if (!out.ok) expect(out.message).toContain("there are none yet");
  });

  test("refuses ambiguity with candidate ids, and takes an explicit id", async () => {
    const op = operation("fixture", [["teamId", "teams"]], null);
    const duplicate = {
      ...directory(),
      teams: async () => [
        { id: "t1", name: "Design" },
        { id: "t2", name: "DESIGN" },
      ],
    };
    const out = await resolveEntityParams(op, { teamId: "design" }, duplicate);
    expect(out).toMatchObject({ ok: false, code: "ambiguous_entity" });
    if (!out.ok) {
      expect(out.message).toContain("Design (id t1)");
      expect(out.message).toContain("DESIGN (id t2)");
    }
    expect(await resolveEntityParams(op, { teamId: "t2" }, duplicate)).toEqual({
      ok: true,
      params: { teamId: "t2" },
    });
  });

  test("propagates a directory failure instead of resolving against nothing", async () => {
    const op = operation("fixture", [["teamId", "teams"]], null);
    const broken = {
      ...directory(),
      teams: async () => {
        throw new Error("gateway 503");
      },
    };
    await expect(
      resolveEntityParams(op, { teamId: "Design" }, broken),
    ).rejects.toThrow("gateway 503");
  });

  test("leaves a parameter the catalog does not resolve untouched", async () => {
    const op = operation("cancelRoutineRun", [["agentId", "agents"], "runId"]);
    expect(
      await resolveEntityParams(
        op,
        { agentId: "Legal", runId: "guess" },
        deps(),
      ),
    ).toEqual({ ok: true, params: { agentId: "a-legal", runId: "guess" } });
  });
});

describe("colour values", () => {
  const createTeam = operation("createAgentTeam", ["input"]);
  const setColor = operation("updateAgentColor", [
    ["agentId", "agents"],
    "color",
  ]);

  test.each([
    "charcoal",
    "UMBER",
    "#1a2b3c",
    "",
  ])("accepts %s as a colour Houston can store", async (color) => {
    expect(
      await resolveEntityParams(createTeam, { input: { color } }, deps()),
    ).toEqual({ ok: true, params: { input: { color } } });
  });

  test.each([
    "blurple",
    "#12345",
    "rgb(1,2,3)",
    7,
  ])("refuses %s and names the palette", async (color) => {
    const out = await resolveEntityParams(
      createTeam,
      { input: { name: "Design", color } },
      deps(),
    );
    expect(out).toMatchObject({ ok: false, code: "invalid_params" });
    if (!out.ok) {
      expect(out.message).toContain('"input.color"');
      expect(out.message).toContain("charcoal");
      expect(out.message).toContain("umber");
    }
  });

  test("checks a colour passed as a parameter of its own", async () => {
    const out = await resolveEntityParams(
      setColor,
      { agentId: "Legal", color: "neon" },
      deps(),
    );
    expect(out).toMatchObject({ ok: false, code: "invalid_params" });
    if (!out.ok) expect(out.message).toContain('"color"');
  });

  test("leaves a body object without a colour alone", async () => {
    const params = { input: { name: "Design", icon: "star" } };
    expect(await resolveEntityParams(createTeam, params, deps())).toEqual({
      ok: true,
      params,
    });
  });
});
