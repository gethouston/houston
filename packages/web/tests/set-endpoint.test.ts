import { afterEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

// The desktop shell repoints an already-built client whenever a new engine
// config lands (`applyConfig` in app/src/lib/engine.ts): every hosted bearer
// rotation (`setHostedEngineSessionToken` — fires again on each Supabase token
// refresh, and immediately in dev under StrictMode's double effect) and a
// sidecar restart on a fresh random port (HOU-432). The adapter client shipped
// without `setEndpoint`, so the SECOND config crashed the whole app with
// "_client.setEndpoint is not a function". These pin the method and its
// in-place repointing on both transports.

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
});

test("setEndpoint repoints gateway calls to the new base URL and bearer", async () => {
  const cap = captureFetch();
  const client = new HoustonClient({
    baseUrl: BASE_A,
    token: "token-1",
    controlPlane: true,
  });
  // listAgents also reads the `agent_colors` account preference in parallel
  // (PRODUCT-1344); pick out the /agents requests so the repointing assertion
  // stays about the endpoint, not about that side channel.
  const agentCalls = () =>
    cap.urls
      .map((url, i) => ({ url, bearer: cap.bearers[i] }))
      .filter((c) => c.url.endsWith("/agents"));
  await client.listAgents("ws");
  expect(agentCalls()[0].url).toBe(`${BASE_A}/agents`);
  expect(agentCalls()[0].bearer).toBe("Bearer token-1");

  // The hosted token-refresh path: same shape the shell applies, twice.
  client.setEndpoint({ baseUrl: BASE_B, token: "token-2" });
  await client.listAgents("ws");
  expect(agentCalls()[1].url).toBe(`${BASE_B}/agents`);
  expect(agentCalls()[1].bearer).toBe("Bearer token-2");
  // The repoint also re-keys the color hydration: its pref reads must follow
  // the endpoint, never keep hitting the old gateway.
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
