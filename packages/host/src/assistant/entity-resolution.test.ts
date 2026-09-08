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
  agentIdentifierParams,
  type EntityResolutionDeps,
  resolveEntityParams,
} from "./entity-resolution";

/**
 * FIXTURE operations, never the generated catalog: these pin the derivation
 * rule and the refusals, which must not move when the adapter's operations do.
 * The routes are copied verbatim from real catalog entries, so the four
 * spellings of an agent reference are exercised as they actually ship.
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
  ({ agents: async () => agents }) satisfies EntityResolutionDeps;

const param = (name: string): AssistantOperationParam => ({
  name,
  required: true,
  schema: Type.String(),
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
  params: string[],
  routed: AssistantRoute | null,
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

describe("agentIdentifierParams", () => {
  test("claims every placeholder filling the segment after /agents", () => {
    const cases: [string, string[], string[]][] = [
      ["/agents/{id}", ["id"], ["id"]],
      [
        "/v1/agents/{agentSlugOrId}/move",
        ["agentSlugOrId", "toSlug"],
        ["agentSlugOrId"],
      ],
      [
        "/agents/{agentPath}/files/folder",
        ["agentPath", "folderName"],
        ["agentPath"],
      ],
      [
        "/agents/{agentId}/skills-manifest",
        ["agentId", "manifest"],
        ["agentId"],
      ],
      [
        "/agents/{agentId}/agentfile/{relPath}",
        ["agentId", "relPath"],
        ["agentId"],
      ],
    ];
    for (const [path, params, expected] of cases) {
      expect(
        agentIdentifierParams(operation("op", params, route(path))),
      ).toEqual(expected);
    }
  });

  test("never claims a look-alike collection or a nested placeholder", () => {
    expect(
      agentIdentifierParams(
        operation("listInstalledConfigs", ["id"], route("/v1/agent-configs")),
      ),
    ).toEqual([]);
    expect(
      agentIdentifierParams(
        operation(
          "cancelRoutineRun",
          ["agentId", "routineId", "runId"],
          route("/agents/{agentId}/routines/{routineId}/runs/{runId}/cancel"),
        ),
      ),
    ).toEqual(["agentId"]);
  });

  test("claims an agent named in a body or query field", () => {
    expect(
      agentIdentifierParams(
        operation(
          "setTarget",
          ["agentId"],
          route("/v1/things", {
            bodyFields: { agentId: "agentId" },
          }),
        ),
      ),
    ).toEqual(["agentId"]);
    expect(
      agentIdentifierParams(
        operation(
          "readBoard",
          ["agentSlugOrId"],
          route("/v1/board", {
            query: { agentSlugOrId: "agentSlugOrId" },
          }),
        ),
      ),
    ).toEqual(["agentSlugOrId"]);
  });

  test("claims an agent-named parameter even with no derivable route", () => {
    expect(
      agentIdentifierParams(operation("x", ["agentId", "body"], null)),
    ).toEqual(["agentId"]);
  });

  test("ignores a placeholder the caller cannot send", () => {
    expect(
      agentIdentifierParams(operation("x", ["other"], route("/agents/{id}"))),
    ).toEqual([]);
  });
});

describe("resolveEntityParams", () => {
  const deleteAgent = operation("deleteAgent", ["id"], route("/agents/{id}"));
  const writeAgentFile = operation(
    "writeAgentFile",
    ["agentId", "relPath", "content"],
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
