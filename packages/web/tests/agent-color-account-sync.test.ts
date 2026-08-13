import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  clearColor,
  flushAgentColorPushes,
  hydrateAgentColors,
  listAgents,
  mergeColorOverlays,
  parseAccountColors,
  setColor,
  setOverlayWriteListener,
} from "../src/engine-adapter/control-plane";
import { DEFAULT_AGENT_COLOR } from "../src/engine-adapter/synthetic";

/**
 * PRODUCT-1344: an agent's color must survive sign-out and follow the account.
 * The device overlay (`houston.web.cp.agentColors`) is account-scoped
 * localStorage, so the sign-out purge deleted it — and the gateway stores no
 * agent color — leaving every agent default-purple with nothing to restore
 * from (all-purple after the team migration's multi-account testing). These
 * tests pin the durable copy: the `agent_colors` account preference, hydrated
 * into the overlay on the agent list and re-pushed on every color write.
 */

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

/** Each test builds a FRESH config object: hydration is keyed on config
 *  identity + active space, so a new object re-hydrates like a new session. */
const freshCfg = () => ({ baseUrl: "http://cp", token: "t" });

const overlay = (): Record<string, string> =>
  JSON.parse(store.get("houston.web.cp.agentColors") ?? "{}");

const prefUrl = "http://cp/v1/preferences/agent_colors";

// ── pure helpers ────────────────────────────────────────────────────────────

test("merge: account fills missing ids, the device pick wins per id", () => {
  expect(
    mergeColorOverlays({ a: "forest", b: "teal" }, { b: "crimson", c: "navy" }),
  ).toEqual({ a: "forest", b: "crimson", c: "navy" });
});

test("parse: absent, corrupt, and non-record values all read as empty", () => {
  expect(parseAccountColors(null)).toEqual({});
  expect(parseAccountColors("not json")).toEqual({});
  expect(parseAccountColors('["forest"]')).toEqual({});
  expect(parseAccountColors('{"a":42,"b":"forest","c":""}')).toEqual({
    b: "forest",
  });
});

// ── hydration ───────────────────────────────────────────────────────────────

test("post-sign-out restore: the account pref repaints an empty device overlay", async () => {
  stubFetch((url) =>
    url === prefUrl
      ? json(200, { value: '{"aaaa111122223333":"forest"}' })
      : json(200, wireAgents),
  );
  const agents = await listAgents(freshCfg());
  expect(agents.find((a) => a.name === "Bob")?.color).toBe("forest");
  expect(agents.find((a) => a.name === "Ada")?.color).toBe(DEFAULT_AGENT_COLOR);
  expect(overlay()).toEqual({ aaaa111122223333: "forest" });
});

test("device pick outranks a stale account copy for the same agent", async () => {
  store.set(
    "houston.web.cp.agentColors",
    '{"aaaa111122223333":"crimson"}', // picked on this device moments ago
  );
  stubFetch((url) =>
    url === prefUrl
      ? json(200, { value: '{"aaaa111122223333":"forest"}' })
      : json(200, wireAgents),
  );
  const agents = await listAgents(freshCfg());
  expect(agents.find((a) => a.name === "Bob")?.color).toBe("crimson");
});

test("pre-fix device colors are healed UP into the account pref", async () => {
  store.set("houston.web.cp.agentColors", '{"aaaa111122223333":"navy"}');
  stubFetch((url) =>
    url === prefUrl && calls.some((c) => c.method === "PUT") === false
      ? json(200, { value: null })
      : json(200, url === prefUrl ? {} : wireAgents),
  );
  await listAgents(freshCfg());
  await flushAgentColorPushes();
  const put = calls.find((c) => c.method === "PUT" && c.url === prefUrl);
  expect(put).toBeDefined();
  expect(JSON.parse(JSON.parse(put?.body ?? "{}").value)).toEqual({
    aaaa111122223333: "navy",
  });
});

test("hydration runs once per space; an in-sync map pushes nothing", async () => {
  store.set("houston.web.cp.agentColors", '{"aaaa111122223333":"forest"}');
  stubFetch((url) =>
    url === prefUrl
      ? json(200, { value: '{"aaaa111122223333":"forest"}' })
      : json(200, wireAgents),
  );
  const cfg = freshCfg();
  await listAgents(cfg);
  await listAgents(cfg);
  await flushAgentColorPushes();
  expect(
    calls.filter((c) => c.url === prefUrl && c.method === "GET").length,
  ).toBe(1);
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
});

test("an unreachable pref read degrades to the device copy and retries next list", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  store.set("houston.web.cp.agentColors", '{"aaaa111122223333":"teal"}');
  let prefReads = 0;
  // 500, not 503: transient statuses are retried INSIDE one cpFetch (the
  // gateway-roll patience), which would hide the degrade path under test.
  // (The successful second read also heals the device map UP with a PUT to
  // the same URL — count reads only.)
  stubFetch((url, method) => {
    if (url !== prefUrl) return json(200, wireAgents);
    if (method === "PUT") return json(200, {});
    prefReads += 1;
    return prefReads === 1
      ? json(500, { error: "boom" })
      : json(200, { value: null });
  });
  const cfg = freshCfg();
  const agents = await listAgents(cfg);
  expect(agents.find((a) => a.name === "Bob")?.color).toBe("teal");
  await listAgents(cfg); // retried — the failed space was never marked hydrated
  expect(prefReads).toBe(2);
  errorSpy.mockRestore();
});

// ── write-through ───────────────────────────────────────────────────────────

test("a color pick after hydration re-pushes the full map to the account", async () => {
  stubFetch((url) =>
    url === prefUrl ? json(200, { value: null }) : json(200, wireAgents),
  );
  await listAgents(freshCfg());
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
  await listAgents(freshCfg());
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
  await listAgents(freshCfg());
  setColor("aaaa111122223333", "umber");
  await flushAgentColorPushes();
  expect(overlay()).toEqual({ aaaa111122223333: "umber" });
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});

test("hydrate never repaints when a fresher device write landed mid-read", async () => {
  // The GET resolves AFTER the user's pick: merged = account ∪ device with the
  // device winning, so the pick must survive the hydration write-back.
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
  const pending = hydrateAgentColors(freshCfg());
  setColor("aaaa111122223333", "rose");
  releasePref(json(200, { value: '{"aaaa111122223333":"charcoal"}' }));
  await pending;
  expect(overlay()).toEqual({ aaaa111122223333: "rose" });
});
