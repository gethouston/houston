import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * Shared-skills calls must never put the SYNTHETIC personal workspace id on
 * the wire. The UI holds "default" (workspaces-mixin replaces the served
 * personal row), but no server speaks that vocabulary: the local host's
 * personal workspace id is its folder name and the gateway's is its fixed
 * "Houston" — both answer 404 "workspace not found" for "default", which
 * broke Share-to-workspace end to end. These tests pin the translation seam:
 * "default" resolves (once, cached) to the server's own non-`org:` workspace
 * row; `org:<slug>` team ids pass through untouched.
 */

const originalFetch = globalThis.fetch;

let store: Map<string, string>;
let calls: { url: string; method: string }[];

beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function stubFetch(...responses: Response[]) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const workspaces = [
  { id: "Houston", name: "Houston", isDefault: true, createdAt: "0" },
  { id: "org:acme", name: "Acme", isDefault: false, createdAt: "0" },
];
const emptyList = { items: [], diagnostics: [] };

const client = () =>
  new HoustonClient({ baseUrl: "http://host", token: "t", controlPlane: true });

test("personal 'default' resolves to the served personal workspace id", async () => {
  stubFetch(json(200, workspaces), json(200, emptyList));

  await client().listSharedSkills("default");

  expect(calls.map((c) => c.url)).toEqual([
    "http://host/v1/workspaces",
    "http://host/v1/workspaces/Houston/shared-skills",
  ]);
});

test("the resolved personal id is cached for the client's lifetime", async () => {
  stubFetch(json(200, workspaces), json(200, emptyList), json(200, emptyList));

  const c = client();
  await c.listSharedSkills("default");
  await c.listSharedSkills("default");

  expect(
    calls.filter((x) => x.url === "http://host/v1/workspaces"),
  ).toHaveLength(1);
});

test("team spaces pass their org:<slug> id through untouched", async () => {
  stubFetch(json(200, emptyList));

  await client().listSharedSkills("org:acme");

  expect(calls.map((c) => c.url)).toEqual([
    "http://host/v1/workspaces/org%3Aacme/shared-skills",
  ]);
});

test("writes resolve too: promote targets the served personal id", async () => {
  stubFetch(
    json(200, workspaces),
    json(200, { name: "audit-my-books", description: "", content: "# s" }),
  );

  await client().promoteSharedSkill("default", "audit-my-books", "# s");

  expect(calls.at(-1)).toEqual({
    url: "http://host/v1/workspaces/Houston/shared-skills/audit-my-books",
    method: "POST",
  });
});

test("a failed resolution is not cached: the next call retries", async () => {
  stubFetch(
    json(500, { error: "boom" }),
    json(200, workspaces),
    json(200, emptyList),
  );

  const c = client();
  await expect(c.listSharedSkills("default")).rejects.toThrow();
  await c.listSharedSkills("default");

  expect(calls.map((x) => x.url)).toEqual([
    "http://host/v1/workspaces",
    "http://host/v1/workspaces",
    "http://host/v1/workspaces/Houston/shared-skills",
  ]);
});
