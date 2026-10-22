import { bus } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const WS = `org:${ORG}`;
const SHARED = `/v1/workspaces/org%3A${ORG}/shared-skills/triage`;
const CONTENT = "---\nname: triage\n---\nSort messages.\n";
const DETAIL = {
  name: "triage",
  description: "Sort messages",
  title: null,
  version: 1,
  content: CONTENT,
};
const { calls, reset, restore, stubRouted } = createWireCapture();
beforeEach(() => {
  installLocalStorage();
  reset();
});
afterEach(restore);
const client = () => {
  const c = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
};
const trace = () => calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);

function store(failure?: string) {
  let local = false;
  stubRouted((call) => {
    const path = new URL(call.url).pathname;
    if (`${call.method} ${path}` === failure)
      return json(500, { error: "write failed" });
    if (path === "/agents")
      return json(200, [{ id: "a", workspaceId: "Houston" }]);
    if (path === "/v1/org") return json(200, { slug: ORG, role: "owner" });
    if (path.endsWith("/skills-manifest"))
      return json(200, { version: 1, enabled: ["other"] });
    if (path === "/agents/a/skills" && call.method === "POST") local = true;
    if (path === "/agents/a/skills/triage" && !local)
      return json(404, { error: "skill not found" });
    return json(200, DETAIL);
  });
}

test("keeping privately uses only existing routes in a safe order with gateway headers", async () => {
  store();
  await client().keepSharedSkillForAgent(WS, "a", "triage");
  expect(trace()).toEqual([
    "GET /v1/org",
    "GET /agents",
    "GET /agents/a/skills-manifest",
    `GET ${SHARED}`,
    "GET /agents/a/skills/triage",
    "POST /agents/a/skills",
    "PUT /agents/a/skills/triage",
    "GET /agents/a/skills-manifest",
    "PUT /agents/a/skills-manifest",
    "GET /v1/org",
    "GET /agents",
    "GET /agents/a/skills-manifest",
    `GET ${SHARED}`,
    "GET /agents/a/skills/triage",
    `DELETE ${SHARED}`,
  ]);
  expect(calls[5].body).toBe(
    JSON.stringify({
      name: "triage",
      description: "Sort messages",
      content: CONTENT,
    }),
  );
  expect(calls[6].body).toBe(JSON.stringify({ content: CONTENT }));
  expect(calls[8].body).toBe(
    JSON.stringify({ version: 1, enabled: ["other", "triage"] }),
  );
  expect(calls.at(-1)?.body).toBeNull();
  for (const call of calls) expectGatewayHeaders(call);
});

test("partial failures undo the copy, reach the caller and invalidate both skill sources", async () => {
  store("PUT /agents/a/skills/triage");
  const echoes: string[] = [];
  const unsubscribe = bus.on((event) => echoes.push(event.type));
  try {
    await expect(
      client().keepSharedSkillForAgent(WS, "a", "triage"),
    ).rejects.toMatchObject({ status: 500 });
    expect(echoes).toContain("SkillsChanged");
    expect(echoes).toContain("SharedSkillsChanged");
    expect(trace()).not.toContain(`DELETE ${SHARED}`);
    expect(trace().slice(-2)).toEqual([
      "GET /agents/a/skills/triage",
      "DELETE /agents/a/skills/triage",
    ]);
  } finally {
    unsubscribe();
  }
});

test("sharing a create-chat skill promotes the exact content and enables only its creator", async () => {
  stubRouted((call) =>
    call.url.endsWith("/skills-manifest")
      ? json(200, { version: 1, enabled: [] })
      : json(200, DETAIL),
  );
  await client().shareNewSkillToWorkspace(WS, "a", "triage");
  expect(trace()).toEqual([
    "GET /agents/a/skills/triage",
    `POST ${SHARED}`,
    "GET /agents/a/skills-manifest",
    "PUT /agents/a/skills-manifest",
    "GET /agents/a/skills/triage",
    "DELETE /agents/a/skills/triage",
  ]);
  expect(calls[1].body).toBe(JSON.stringify({ content: CONTENT }));
  expect(calls[3].body).toBe(
    JSON.stringify({ version: 1, enabled: ["triage"] }),
  );
  for (const call of calls) expectGatewayHeaders(call);
});

test("SDK creation defaults use the active org, not the pod's internal workspace", async () => {
  store();
  await client().createSkill({
    workspacePath: "a",
    name: "Triage",
    description: "Sort messages",
    content: "Sort messages.",
  });
  expect(trace()).toEqual([
    "POST /agents/a/skills",
    "GET /agents",
    "GET /agents/a/skills/triage",
    `POST ${SHARED}`,
    "GET /agents/a/skills-manifest",
    "PUT /agents/a/skills-manifest",
    "GET /agents/a/skills/triage",
    "DELETE /agents/a/skills/triage",
  ]);
  for (const call of calls) expectGatewayHeaders(call);
});
