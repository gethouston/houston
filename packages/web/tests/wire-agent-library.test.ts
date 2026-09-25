import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The agent READS the web adapter delegates to `@houston/sdk`: the agent list,
 * and the account's agent-template library (list + install-from-GitHub).
 *
 * Each call MUST issue exactly the request recorded here — same method, whole
 * URL, body bytes and headers (`Content-Type`,
 * `Authorization` bearer, and the live `x-houston-org`). What stays ADAPTER-side
 * is asserted alongside the wire: the colour overlay reconcile riding the list
 * read, the `agentConfigLibrary` capability gate, and the library's 404 → `[]`.
 */

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

/** Answer each request by URL+method, recording every one. */
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

/** The list read and the colour-preference reconcile, both answered. */
const listAndPrefs = (agents: unknown[] = [WIRE_AGENT]) =>
  stubFetch((url) =>
    url === PREF_URL ? json(200, { value: null }) : json(200, agents),
  );

// ---- agent list ----

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

  // Exactly the two requests the old control-plane read made: the list, and the
  // `agent_colors` preference the overlay reconciles against.
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
  // The gateway's extras survive the SDK read: the OS reveal path and the
  // caller's teams access both come off the same wire record.
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
  // Naming every row's job costs nothing past the list itself: no per-agent
  // CLAUDE.md read, which on a hosted gateway woke each employee's pod.
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

// ---- agent-config library ----

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

  // The degrade is the adapter's: the SDK propagated the 404 and the mixin
  // caught it on status, so the picker falls back to the bundled templates.
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

// ---- the colour write that stays adapter-side ----

test("updateAgent still writes the overlay and re-reads the list, one request", async () => {
  stubFetch(() => json(200, [WIRE_AGENT]));

  const agent = await client().updateAgent("Houston", WIRE_AGENT.id, {
    color: "golden",
  });

  // The picker's write stays adapter-side: one list re-read, no colour on the
  // wire. (The overlay write mirrors the map up to the `agent_colors` account
  // preference afterwards — that push is the sync layer's, not this call's.)
  expect(agent.color).toBe("golden");
  expect(
    calls.filter((call) => call.url !== PREF_URL).map((call) => call.url),
  ).toEqual([`${BASE}/agents`]);
});
