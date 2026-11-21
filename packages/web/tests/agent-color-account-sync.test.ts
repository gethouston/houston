import { HoustonClient } from "@houston/engine-adapter/client";
import {
  clearColor,
  flushAgentColorPushes,
  mergeColorOverlays,
  parseAccountColors,
  setColor,
  setOverlayWriteListener,
  syncAgentColors,
} from "@houston/engine-adapter/control-plane";
import { DEFAULT_AGENT_COLOR } from "@houston/engine-adapter/synthetic";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const originalFetch = globalThis.fetch;

let store: Map<string, string>;
let calls: { url: string; method: string; body: string | null }[];

beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(async () => {
  await flushAgentColorPushes();
  setOverlayWriteListener(null);
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function stubFetch(respond: (url: string, method: string) => Response) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return respond(url, method);
  }) as unknown as typeof fetch;
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const wireAgents = [
  { id: "aaaa111122223333", workspaceId: "Houston", name: "Bob", createdAt: 0 },
  { id: "bbbb111122223333", workspaceId: "Houston", name: "Ada", createdAt: 0 },
];

const freshClient = () =>
  new HoustonClient({ baseUrl: "http://cp", token: "t", controlPlane: true });
const freshCfg = () => ({ baseUrl: "http://cp", token: "t" });
const WS = "Houston";

const overlay = (): Record<string, string> =>
  JSON.parse(store.get("houston.web.cp.agentColors") ?? "{}");

const prefUrl = "http://cp/v1/preferences/agent_colors";

test("merge: entries only one side holds always survive", () => {
  const account = { a: "forest", b: "teal" };
  const device = { b: "crimson", c: "navy" };
  expect(mergeColorOverlays(account, device, true)).toEqual({
    a: "forest",
    b: "crimson",
    c: "navy",
  });
  expect(mergeColorOverlays(account, device, false)).toEqual({
    a: "forest",
    b: "teal",
    c: "navy",
  });
});

test("parse: absent, corrupt, and non-record values all read as empty", () => {
  expect(parseAccountColors(null)).toEqual({});
  expect(parseAccountColors("not json")).toEqual({});
  expect(parseAccountColors('["forest"]')).toEqual({});
  expect(parseAccountColors('{"a":42,"b":"forest","c":""}')).toEqual({
    b: "forest",
  });
});

test("post-sign-out restore: the account pref repaints an empty device overlay", async () => {
  stubFetch((url) =>
    url === prefUrl
      ? json(200, { value: '{"aaaa111122223333":"forest"}' })
      : json(200, wireAgents),
  );
  const agents = await freshClient().listAgents(WS);
  expect(agents.find((a) => a.name === "Bob")?.color).toBe("forest");
  expect(agents.find((a) => a.name === "Ada")?.color).toBe(DEFAULT_AGENT_COLOR);
  expect(overlay()).toEqual({ aaaa111122223333: "forest" });
});

test("an unsaved device pick outranks the account copy it is replacing", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  stubFetch((url, method) => {
    if (url !== prefUrl) return json(200, wireAgents);
    return method === "PUT"
      ? json(500, { error: "boom" })
      : json(200, { value: '{"aaaa111122223333":"forest"}' });
  });
  const client = freshClient();
  await client.listAgents(WS);
  setColor("aaaa111122223333", "crimson");
  await flushAgentColorPushes();
  const agents = await client.listAgents(WS);
  expect(agents.find((a) => a.name === "Bob")?.color).toBe("crimson");
  errorSpy.mockRestore();
});

test("a color set elsewhere lands on this device once the account has ours", async () => {
  let accountValue = '{"aaaa111122223333":"forest"}';
  stubFetch((url, method) => {
    if (url !== prefUrl) return json(200, wireAgents);
    return method === "PUT"
      ? json(200, {})
      : json(200, { value: accountValue });
  });
  const client = freshClient();
  expect(
    (await client.listAgents(WS)).find((a) => a.name === "Bob")?.color,
  ).toBe("forest");
  accountValue = '{"aaaa111122223333":"golden"}';
  expect(
    (await client.listAgents(WS)).find((a) => a.name === "Bob")?.color,
  ).toBe("golden");
  expect(overlay()).toEqual({ aaaa111122223333: "golden" });
});

test("pre-fix device colors are healed UP into the account pref", async () => {
  store.set("houston.web.cp.agentColors", '{"aaaa111122223333":"navy"}');
  stubFetch((url) =>
    url === prefUrl && calls.some((c) => c.method === "PUT") === false
      ? json(200, { value: null })
      : json(200, url === prefUrl ? {} : wireAgents),
  );
  await freshClient().listAgents(WS);
  await flushAgentColorPushes();
  const put = calls.find((c) => c.method === "PUT" && c.url === prefUrl);
  expect(put).toBeDefined();
  expect(JSON.parse(JSON.parse(put?.body ?? "{}").value)).toEqual({
    aaaa111122223333: "navy",
  });
});

test("every list re-reads the account copy; an in-sync map pushes nothing", async () => {
  store.set("houston.web.cp.agentColors", '{"aaaa111122223333":"forest"}');
  stubFetch((url) =>
    url === prefUrl
      ? json(200, { value: '{"aaaa111122223333":"forest"}' })
      : json(200, wireAgents),
  );
  const client = freshClient();
  await client.listAgents(WS);
  await client.listAgents(WS);
  await flushAgentColorPushes();
  expect(
    calls.filter((c) => c.url === prefUrl && c.method === "GET").length,
  ).toBe(2);
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
});

test("an unreachable pref read degrades to the device copy and retries next list", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  store.set("houston.web.cp.agentColors", '{"aaaa111122223333":"teal"}');
  let prefReads = 0;
  stubFetch((url, method) => {
    if (url !== prefUrl) return json(200, wireAgents);
    if (method === "PUT") return json(200, {});
    prefReads += 1;
    return prefReads === 1
      ? json(500, { error: "boom" })
      : json(200, { value: null });
  });
  const client = freshClient();
  const agents = await client.listAgents(WS);
  expect(agents.find((a) => a.name === "Bob")?.color).toBe("teal");
  await client.listAgents(WS);
  expect(prefReads).toBe(2);
  errorSpy.mockRestore();
});

test("a color pick after hydration re-pushes the full map to the account", async () => {
  stubFetch((url) =>
    url === prefUrl ? json(200, { value: null }) : json(200, wireAgents),
  );
  await freshClient().listAgents(WS);
  setColor("aaaa111122223333", "golden");
  await flushAgentColorPushes();
  const put = calls
    .filter((c) => c.method === "PUT" && c.url === prefUrl)
    .at(-1);
  expect(JSON.parse(JSON.parse(put?.body ?? "{}").value)).toEqual({
    aaaa111122223333: "golden",
  });
});

test("a delete clears the agent's entry from the account copy too", async () => {
  store.set("houston.web.cp.agentColors", '{"aaaa111122223333":"forest"}');
  stubFetch((url) =>
    url === prefUrl
      ? json(200, { value: '{"aaaa111122223333":"forest"}' })
      : json(200, wireAgents),
  );
  await freshClient().listAgents(WS);
  clearColor("aaaa111122223333");
  await flushAgentColorPushes();
  const put = calls
    .filter((c) => c.method === "PUT" && c.url === prefUrl)
    .at(-1);
  expect(JSON.parse(JSON.parse(put?.body ?? "{}").value)).toEqual({});
});

test("a failed account save keeps the device pick and stays quiet", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  stubFetch((url, method) => {
    if (url !== prefUrl) return json(200, wireAgents);
    return method === "PUT"
      ? json(500, { error: "boom" })
      : json(200, { value: null });
  });
  await freshClient().listAgents(WS);
  setColor("aaaa111122223333", "umber");
  await flushAgentColorPushes();
  expect(overlay()).toEqual({ aaaa111122223333: "umber" });
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});

test("the reconcile never repaints over a device write that landed mid-read", async () => {
  let releasePref: (r: Response) => void = () => {};
  const gate = new Promise<Response>((resolve) => {
    releasePref = resolve;
  });
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: null });
    if (url === prefUrl && (init?.method ?? "GET") === "GET") return gate;
    return json(200, wireAgents);
  }) as unknown as typeof fetch;
  const pending = syncAgentColors(freshCfg());
  setColor("aaaa111122223333", "rose");
  releasePref(json(200, { value: '{"aaaa111122223333":"charcoal"}' }));
  await pending;
  expect(overlay()).toEqual({ aaaa111122223333: "rose" });
});
