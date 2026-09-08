import { Type } from "typebox";
import { expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { ReachableAgent } from "../routes/reachable-agents";
import type { AssistantOperation, AssistantOperationParam } from "./catalog";
import {
  type EntityResolutionDeps,
  resolveEntityParams,
} from "./entity-resolution";

/**
 * IDENTIFIERS THAT ARRIVE INSIDE A BODY, and the two shapes they arrive in.
 *
 * The resolver used to read top-level string parameters and nothing else, so a
 * manifest's list of skills, a list of people, and every field of a body object
 * reached the approval card and the request exactly as the model wrote them:
 * checked against nothing, presented to the user as fact. These pin the walk
 * that closes it - one level in, lists included - and pin that a value nothing
 * matches is refused with the values that do exist.
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

const agentRow = (id: string, name: string): Agent => ({
  id,
  workspaceId: "ws-home",
  name,
  createdAt: 0,
});

const HOME = workspace("ws-home", "Home");
const REACHABLE: ReachableAgent[] = [
  { workspace: HOME, agent: agentRow("a-legal", "Legal") },
];

let skillReads = 0;

const deps = () =>
  ({
    agents: async () => REACHABLE,
    teams: async () => [],
    workspaces: async () => [],
    members: async () => [
      { userId: "u1", name: "Jules", email: "jules@test.dev" },
      { userId: "u2", name: "Ana", email: "ana@test.dev" },
    ],
    invites: async () => [],
    routines: async () => [],
    skills: async (scope: string) => {
      skillReads++;
      expect(scope).toBe("a-legal");
      return [
        { slug: "draft", name: "Drafting" },
        { slug: "invoice", name: "Invoicing" },
      ];
    },
    sharedSkills: async () => [],
    activities: async () => [],
  }) as unknown as EntityResolutionDeps;

const operation = (
  name: string,
  params: AssistantOperationParam[],
): AssistantOperation => ({
  name,
  group: "agents",
  description: name,
  confirm: true,
  hidden: false,
  params,
  returns: Type.Unknown(),
  route: null,
});

const agentParam: AssistantOperationParam = {
  name: "agentId",
  required: true,
  schema: Type.String(),
  resolver: "agents",
};

const putSkillsManifest = operation("putSkillsManifest", [
  agentParam,
  {
    name: "manifest",
    required: true,
    schema: Type.Unknown(),
    fields: [{ name: "enabled", resolver: "skills", source: "listSkills" }],
  },
]);

// Exactly as the catalog declares it: the parameter itself names people (the
// plain list-of-ids form) AND each object entry carries `userId`.
const setAgentAssignments = operation("setAgentAssignments", [
  agentParam,
  {
    name: "assignments",
    required: true,
    schema: Type.Unknown(),
    resolver: "members",
    source: "getOrgPeople",
    fields: [{ name: "userId", resolver: "members", source: "getOrgPeople" }],
  },
]);

test("a list inside a body object resolves entry by entry", async () => {
  skillReads = 0;
  const out = await resolveEntityParams(
    putSkillsManifest,
    {
      agentId: "Legal",
      manifest: { version: 1, enabled: ["Drafting", "invoice"] },
    },
    deps(),
  );
  expect(out).toEqual({
    ok: true,
    params: {
      agentId: "a-legal",
      manifest: { version: 1, enabled: ["draft", "invoice"] },
    },
  });
  // One directory read for the whole list: two reads could disagree, and the
  // refusal would then name values from neither.
  expect(skillReads).toBe(1);
});

test("a name nothing matches inside a body is refused with the ones that exist", async () => {
  const out = await resolveEntityParams(
    putSkillsManifest,
    {
      agentId: "Legal",
      manifest: { version: 1, enabled: ["Drafting", "made up"] },
    },
    deps(),
  );
  expect(out).toMatchObject({ ok: false, code: "unknown_entity" });
  if (!out.ok) {
    expect(out.message).toContain('"manifest.enabled"');
    expect(out.message).toContain("Drafting (id draft)");
  }
});

test("every element of a list of objects is resolved", async () => {
  const out = await resolveEntityParams(
    setAgentAssignments,
    {
      agentId: "Legal",
      assignments: [
        { userId: "jules@test.dev", access: "manager" },
        { userId: "Ana", access: "user" },
      ],
    },
    deps(),
  );
  expect(out).toEqual({
    ok: true,
    params: {
      agentId: "a-legal",
      assignments: [
        { userId: "u1", access: "manager" },
        { userId: "u2", access: "user" },
      ],
    },
  });
});

test("a body that omits the field is left exactly as it came", async () => {
  const params = { agentId: "Legal", manifest: { version: 1 } };
  const out = await resolveEntityParams(putSkillsManifest, params, deps());
  expect(out).toEqual({
    ok: true,
    params: { agentId: "a-legal", manifest: { version: 1 } },
  });
  // The caller's object is never mutated: the approval card and the request are
  // built from the returned copy.
  expect(params.manifest).toEqual({ version: 1 });
});

test("a field whose value is not a name at all is refused, never forwarded", async () => {
  const out = await resolveEntityParams(
    putSkillsManifest,
    { agentId: "Legal", manifest: { version: 1, enabled: [""] } },
    deps(),
  );
  expect(out).toMatchObject({ ok: false, code: "invalid_params" });
});

test("a scoped field with no resolved parent is refused, not read unscoped", async () => {
  const orphan = operation("putSkillsManifest", [
    {
      name: "manifest",
      required: true,
      schema: Type.Unknown(),
      fields: [{ name: "enabled", resolver: "skills" }],
    },
  ]);
  const out = await resolveEntityParams(
    orphan,
    { manifest: { enabled: ["draft"] } },
    deps(),
  );
  expect(out).toEqual({
    ok: false,
    code: "invalid_params",
    message: '"manifest.enabled" requires a resolved agents scope.',
  });
});

test("a bare list of people resolves without touching the object form", async () => {
  const out = await resolveEntityParams(
    setAgentAssignments,
    { agentId: "Legal", assignments: ["jules@test.dev", "u2"] },
    deps(),
  );
  expect(out).toEqual({
    ok: true,
    params: { agentId: "a-legal", assignments: ["u1", "u2"] },
  });
});
