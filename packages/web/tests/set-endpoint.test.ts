import { HoustonClient } from "@houston/engine-adapter/client";
import { PREWARM_TYPING_MS } from "@houston/sdk/draft-typing";
import { afterEach, expect, test, vi } from "vitest";

const BASE_A = "https://gateway-a.example";
const BASE_B = "https://gateway-b.example";

function captureFetch(): { urls: string[]; bearers: (string | null)[] } {
  const urls: string[] = [];
  const bearers: (string | null)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      urls.push(String(input));
      bearers.push(new Headers(init?.headers).get("Authorization"));
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return { urls, bearers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("setEndpoint repoints gateway calls to the new base URL and bearer", async () => {
  const cap = captureFetch();
  const client = new HoustonClient({
    baseUrl: BASE_A,
    token: "token-1",
    controlPlane: true,
  });
  const agentCalls = () =>
    cap.urls
      .map((url, i) => ({ url, bearer: cap.bearers[i] }))
      .filter((c) => c.url.endsWith("/agents"));
  await client.listAgents("ws");
  expect(agentCalls()[0].url).toBe(`${BASE_A}/agents`);
  expect(agentCalls()[0].bearer).toBe("Bearer token-1");

  client.setEndpoint({ baseUrl: BASE_B, token: "token-2" });
  await client.listAgents("ws");
  expect(agentCalls()[1].url).toBe(`${BASE_B}/agents`);
  expect(agentCalls()[1].bearer).toBe("Bearer token-2");
  const prefBases = cap.urls
    .filter((u) => u.includes("/v1/preferences/"))
    .map((u) => new URL(u).origin);
  expect(prefBases).toEqual([BASE_A, BASE_B]);
});

test("setEndpoint rebuilds the direct runtime client on the new port (local sidecar restart)", async () => {
  const cap = captureFetch();
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:50001",
    token: "t1",
    controlPlane: false,
  });
  await client.providerStatus("anthropic");
  expect(cap.urls[0]).toBe("http://127.0.0.1:50001/providers");

  client.setEndpoint({ baseUrl: "http://127.0.0.1:50002", token: "t2" });
  await client.providerStatus("anthropic");
  expect(cap.urls[1]).toBe("http://127.0.0.1:50002/providers");
  expect(cap.bearers[1]).toBe("Bearer t2");
});

test("setEndpoint keeps the id a new chat's typing already prewarmed", async () => {
  vi.useFakeTimers({ toFake: ["Date", "performance"] });
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({ outcome: "launching", holdMs: 20_000 }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  const client = new HoustonClient({
    baseUrl: BASE_A,
    token: "token-1",
    controlPlane: true,
  });
  const draft = {
    agentId: "agent",
    draftKey: "new-conversation:board",
    text: "h",
  };
  for (let t = 0; t <= PREWARM_TYPING_MS; t += 250) {
    await client.draftChanged(draft, { conversationPrewarm: true });
    vi.advanceTimersByTime(250);
  }
  const prewarmUrl = urls.find((url) => url.endsWith("/prewarm")) ?? "";
  const prewarmed = /conversations\/activity-([^/]+)\/prewarm$/.exec(
    prewarmUrl,
  )?.[1];
  expect(prewarmed).toBeTruthy();
  client.setEndpoint({ baseUrl: BASE_A, token: "token-2" });
  expect(client.claimNewConversationId("new-conversation:board")).toBe(
    prewarmed,
  );
});
