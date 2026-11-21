import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const BASE = "http://host";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

function stubFetch(respond: (url: string, method: string) => Response) {
  stubRouted((call) => respond(call.url, call.method));
}

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

const WIRE_AGENT = {
  id: "aaaa111122223333",
  workspaceId: "Houston",
  name: "Ada",
  createdAt: 0,
};

const PREF_URL = `${BASE}/v1/preferences/agent_colors`;
const CAPS_URL = `${BASE}/v1/capabilities`;

const listAndPrefs = (agents: unknown[] = [WIRE_AGENT]) =>
  stubFetch((url) =>
    url === PREF_URL ? json(200, { value: null }) : json(200, agents),
  );

test("listAgents delegates a byte-identical GET /agents (headers + org)", async () => {
  listAndPrefs();
  const c = client();
  c.setActiveOrg(ORG);

  await c.listAgents("Houston");

  const list = calls.find((call) => call.url === `${BASE}/agents`);
  expect(list?.method).toBe("GET");
  expect(list?.body).toBeNull();
  expect(list?.headers.get("Content-Type")).toBe("application/json");
  expect(list?.headers.get("Authorization")).toBe("Bearer t");
  expect(list?.headers.get("x-houston-org")).toBe(ORG);
});

test("listAgents reads the list ONCE, alongside the colour reconcile", async () => {
  listAndPrefs();

  await client().listAgents("Houston");

  expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
    `GET ${BASE}/agents`,
    `GET ${PREF_URL}`,
  ]);
});

test("listAgents maps the wire agent to the UI shape the app renders", async () => {
  listAndPrefs([{ ...WIRE_AGENT, dir: "/data/Ada", access: "manager" }]);

  const [agent] = await client().listAgents("Houston");

  expect(agent.id).toBe(WIRE_AGENT.id);
  expect(agent.folderPath).toBe(WIRE_AGENT.id);
  expect(agent.localDir).toBe("/data/Ada");
  expect(agent.access).toBe("manager");
});

test("the role rides the listing: one GET /agents, no job description read", async () => {
  listAndPrefs([
    { ...WIRE_AGENT, role: "Bookkeeper" },
    { ...WIRE_AGENT, id: "bbbb111122223333", name: "Bo" },
  ]);

  const [ada, bo] = await client().listAgents("Houston");

  expect(ada.role).toBe("Bookkeeper");
  expect(bo.role).toBeUndefined();
  expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
    `GET ${BASE}/agents`,
    `GET ${PREF_URL}`,
  ]);
});

test("a failed agent list propagates — never swallowed", async () => {
  stubFetch((url) =>
    url === PREF_URL
      ? json(200, { value: null })
      : json(500, { error: "boom" }),
  );

  await expect(client().listAgents("Houston")).rejects.toThrow(
    "boom (engine error 500)",
  );
});

test("listInstalledConfigs delegates a byte-identical GET /v1/agent-configs", async () => {
  stubFetch((url) =>
    url === CAPS_URL
      ? json(200, { profile: "cloud" })
      : json(200, [{ config: { name: "helper" }, path: "helper" }]),
  );
  const c = client();
  c.setActiveOrg(ORG);

  await expect(c.listInstalledConfigs()).resolves.toEqual([
    { config: { name: "helper" }, path: "helper" },
  ]);

  const [, read] = calls;
  expect(read.method).toBe("GET");
  expect(read.url).toBe(`${BASE}/v1/agent-configs`);
  expect(read.body).toBeNull();
  expect(read.headers.get("Authorization")).toBe("Bearer t");
  expect(read.headers.get("x-houston-org")).toBe(ORG);
});

test("a 404 on the library reads as nothing installed, and the SDK still throws it", async () => {
  stubFetch((url) =>
    url === CAPS_URL
      ? json(200, { profile: "cloud" })
      : json(404, { error: "not found" }),
  );

  await expect(client().listInstalledConfigs()).resolves.toEqual([]);
  expect(calls).toHaveLength(2);
});

test("installAgentFromGithub delegates a byte-identical POST with the url body", async () => {
  stubFetch(() => json(200, { agentId: "aaaa111122223333" }));

  await expect(
    client().installAgentFromGithub({ githubUrl: "https://github.com/a/b" }),
  ).resolves.toEqual({ agentId: "aaaa111122223333" });

  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/v1/agents/install-from-github`);
  expect(post.body).toBe(
    JSON.stringify({ githubUrl: "https://github.com/a/b" }),
  );
  expect(post.headers.get("Content-Type")).toBe("application/json");
  expect(post.headers.get("Authorization")).toBe("Bearer t");
});

test("updateAgent still writes the overlay and re-reads the list, one request", async () => {
  stubFetch(() => json(200, [WIRE_AGENT]));

  const agent = await client().updateAgent("Houston", WIRE_AGENT.id, {
    color: "golden",
  });

  expect(agent.color).toBe("golden");
  expect(
    calls.filter((call) => call.url !== PREF_URL).map((call) => call.url),
  ).toEqual([`${BASE}/agents`]);
});

test("each employee's timezone survives the SDK list and the surface mapping", async () => {
  listAndPrefs([
    { ...WIRE_AGENT, timezone: "Asia/Tokyo" },
    { ...WIRE_AGENT, id: "bbbb111122223333", timezone: "America/Bogota" },
    { ...WIRE_AGENT, id: "cccc111122223333" },
  ]);
  const c = client();
  c.setActiveOrg(ORG);
  expect((await c.listAgents("Houston")).map((a) => a.timezone)).toEqual([
    "Asia/Tokyo",
    "America/Bogota",
    undefined,
  ]);
  expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
    ["GET", `${BASE}/agents`, null],
    ["GET", PREF_URL, null],
  ]);
  const read = calls[0];
  expect(read.headers.get("Content-Type")).toBe("application/json");
  expect(read.headers.get("Authorization")).toBe("Bearer t");
  expect(read.headers.get("x-houston-org")).toBe(ORG);
});
