import { expect, test } from "vitest";
import { RemoteSharedEndpointStore } from "./remote-shared-endpoint-store";

type FetchCall = { url: string; init?: RequestInit };

const BASE = "https://gateway.test";
const ORG = "0011223344556677";
const AGENT = "8899aabbccddeeff";
const PATH = `${BASE}/v1/pod/shared-endpoint/${ORG}/${AGENT}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function fakeFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return await handler(call);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function store(fetchImpl: typeof fetch) {
  return new RemoteSharedEndpointStore({
    baseUrl: `${BASE}/`,
    orgSlug: ORG,
    agentSlug: AGENT,
    podToken: "pod-token",
    fetchImpl,
  });
}

function headers(call: FetchCall): Record<string, string> {
  return call.init?.headers as Record<string, string>;
}

test("get returns the shared endpoint from the gateway", async () => {
  const endpoint = {
    baseUrl: "https://relay.example.com/v1",
    model: "qwen",
    name: null,
    contextWindow: 131_072,
    reasoning: false,
    apiKey: "secret",
    ownerAgent: "fedcba9876543210",
  };
  const { calls, fetchImpl } = fakeFetch(() => json(endpoint));

  await expect(store(fetchImpl).get()).resolves.toEqual(endpoint);
  expect(calls[0]?.url).toBe(PATH);
  expect(headers(calls[0] as FetchCall).Authorization).toBe("Bearer pod-token");
});

test("get treats 404 as no organization share", async () => {
  const { fetchImpl } = fakeFetch(() =>
    json({ error: "no shared endpoint" }, 404),
  );
  await expect(store(fetchImpl).get()).resolves.toBeNull();
});

test("gateway failures surface with the response detail", async () => {
  const { fetchImpl } = fakeFetch(() => json({ error: "upstream down" }, 500));
  await expect(store(fetchImpl).get()).rejects.toThrow(
    /shared endpoint gateway GET failed \(500\)/,
  );
});

test("put writes the endpoint descriptor without undefined fields", async () => {
  const { calls, fetchImpl } = fakeFetch(() => json({ ok: true }));

  await store(fetchImpl).put({
    baseUrl: "https://relay.example.com/v1",
    model: "qwen",
    reasoning: false,
    apiKey: "secret",
  });

  expect(calls[0]?.init?.method).toBe("PUT");
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
    baseUrl: "https://relay.example.com/v1",
    model: "qwen",
    reasoning: false,
    apiKey: "secret",
  });
});

test("owner-only removal sends the ownership guard header", async () => {
  const { calls, fetchImpl } = fakeFetch(() => json({ ok: true }));
  const remote = store(fetchImpl);

  await remote.remove({ ownerOnly: true });
  await remote.remove({ ownerOnly: false });

  expect(calls[0]?.init?.method).toBe("DELETE");
  expect(headers(calls[0] as FetchCall)["x-houston-owner-only"]).toBe("1");
  expect(
    headers(calls[1] as FetchCall)["x-houston-owner-only"],
  ).toBeUndefined();
});
