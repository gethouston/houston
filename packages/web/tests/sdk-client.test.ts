import { gatewayAuthFetch } from "@houston/engine-adapter/control-plane";
import { createEngineSdk } from "@houston/engine-adapter/sdk-client";
import { afterEach, expect, test, vi } from "vitest";

const SLUG = "0123456789abcdef";
const BASE = "https://gateway.example";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(...responses: Response[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

function headerOf(call: Call, name: string): string | null {
  return new Headers(call.init?.headers).get(name);
}

test("constructing the SDK fires no request (inert seam)", async () => {
  const calls = stubFetch();
  const sdk = createEngineSdk({
    baseUrl: `${BASE}/`,
    fetch: gatewayAuthFetch("tok", () => null),
  });
  expect(sdk.agents).toBeDefined();
  expect(sdk.activities).toBeDefined();
  expect(sdk.providers).toBeDefined();
  expect(sdk.integrations).toBeDefined();
  expect(sdk.preferences).toBeDefined();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toHaveLength(0);
});

test("a delegated write rides the shared gateway fetch (base URL + bearer)", async () => {
  const calls = stubFetch(
    json(200, { id: "a1", name: "New", workspaceId: "w1", createdAt: 0 }),
    json(200, []),
  );
  const sdk = createEngineSdk({
    baseUrl: `${BASE}/`,
    fetch: gatewayAuthFetch("tok-123", () => null),
  });

  await sdk.agents.create("New");

  expect(calls[0].url).toBe(`${BASE}/agents`);
  expect((calls[0].init?.method ?? "GET").toUpperCase()).toBe("POST");
  expect(headerOf(calls[0], "Authorization")).toBe("Bearer tok-123");
  expect(calls[0].init?.body).toBe(JSON.stringify({ name: "New" }));
  expect(calls[1].url).toBe(`${BASE}/agents`);
});

test("writes carry the live x-houston-org header, re-read per call", async () => {
  let org: string | null = null;
  const sdk = createEngineSdk({
    baseUrl: BASE,
    fetch: gatewayAuthFetch("tok", () => org),
  });

  const personal = stubFetch(json(200, []));
  await sdk.agents.refresh();
  expect(headerOf(personal[0], "x-houston-org")).toBeNull();

  org = SLUG;
  const team = stubFetch(json(200, []));
  await sdk.agents.refresh();
  expect(headerOf(team[0], "x-houston-org")).toBe(SLUG);
});
