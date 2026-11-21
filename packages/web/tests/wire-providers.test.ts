import { bus } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { wireAgent } from "./support/agent-list";
import {
  type Call,
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const BASE = "http://host";
const AGENT = "agent-1";
const KEY = "sk-live-aaaabbbbcccc";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

async function settled(agents: object[]): Promise<HoustonClient> {
  stubRouted((call) =>
    call.url.endsWith("/agents") ? json(200, agents) : json(200, {}),
  );
  const client = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  await client.listAgents("ws");
  reset();
  return client;
}

const withAgent = () => settled([wireAgent(AGENT)]);
const withNoAgent = () => settled([]);

const credentialCalls = (): Call[] =>
  calls.filter(
    (call) =>
      call.url.includes("/credential/") ||
      call.url.includes("/provider/openai-compatible"),
  );

async function busEvents(run: () => Promise<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  const unsubscribe = bus.on((event) => events.push(event));
  try {
    await run();
  } finally {
    unsubscribe();
  }
  return events;
}

const signedOut = (provider: string) => ({
  type: "ProviderLoginComplete",
  data: { provider, success: false, error: null },
});

function expectWrite(url: string, body: string | null): Call {
  const written = credentialCalls();
  expect(written).toHaveLength(1);
  expect(written[0].url).toBe(url);
  expect(written[0].method).toBe("POST");
  expect(written[0].body).toBe(body);
  expectGatewayHeaders(written[0]);
  return written[0];
}

describe("the connect-once capture", () => {
  test("POSTs the just-connected provider to the agent's capture route", async () => {
    const client = await withAgent();

    await client.engineSdk.providers.credentials.captureCredential(
      AGENT,
      "anthropic",
    );

    expectWrite(
      `${BASE}/agents/${AGENT}/credential/capture`,
      JSON.stringify({ provider: "anthropic" }),
    );
  });

  test("sends NO body when no provider is named", async () => {
    const client = await withAgent();

    await client.engineSdk.providers.credentials.captureCredential(AGENT);

    expectWrite(`${BASE}/agents/${AGENT}/credential/capture`, null);
  });

  test("captures on the setup runtime before any agent exists", async () => {
    const client = await withNoAgent();

    await client.engineSdk.providers.credentials.captureSetupCredential(
      "anthropic",
    );

    expectWrite(
      `${BASE}/setup-runtime/credential/capture`,
      JSON.stringify({ provider: "anthropic" }),
    );
  });
});

describe("the desktop's Claude OAuth push", () => {
  test("PUSHes the credential JSON verbatim to the agent's pod", async () => {
    const client = await withAgent();
    const credential = JSON.stringify({ claudeAiOauth: { accessToken: KEY } });

    await client.pushClaudeOAuthCredential(credential);

    const call = expectWrite(
      `${BASE}/agents/${AGENT}/credential/claude-oauth`,
      credential,
    );
    expect(call.url).not.toContain(KEY);
  });

  test("falls to the setup runtime when the space has no agent", async () => {
    const client = await withNoAgent();

    await client.pushClaudeOAuthCredential("{}");

    expectWrite(`${BASE}/setup-runtime/credential/claude-oauth`, "{}");
  });
});

describe("sign-out", () => {
  test("forgets the central credential first, then clears the runtime's copy", async () => {
    const client = await withAgent();

    await client.providerLogout("anthropic");

    expectWrite(
      `${BASE}/agents/${AGENT}/credential/forget`,
      JSON.stringify({ provider: "anthropic" }),
    );
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/agents/${AGENT}/credential/forget`,
      `${BASE}/agents/${AGENT}/auth/anthropic/logout`,
    ]);
  });

  test("signs a space with no agent out through the setup runtime", async () => {
    const client = await withNoAgent();

    await client.providerLogout("anthropic");

    expectWrite(
      `${BASE}/setup-runtime/credential/forget`,
      JSON.stringify({ provider: "anthropic" }),
    );
  });

  test("announces the connection change on the per-agent path", async () => {
    const client = await withAgent();

    const events = await busEvents(() => client.providerLogout("anthropic"));

    expect(events).toContainEqual(signedOut("anthropic"));
  });

  test("announces it on the agentless setup-runtime path too", async () => {
    const client = await withNoAgent();

    const events = await busEvents(() => client.providerLogout("anthropic"));

    expect(events).toContainEqual(signedOut("anthropic"));
  });

  test("announces it on the local profile, which has no credential store", async () => {
    stubRouted(() => json(200, {}));
    const client = new HoustonClient({
      baseUrl: BASE,
      token: "t",
      controlPlane: false,
    });

    const events = await busEvents(() => client.providerLogout("anthropic"));

    expect(events).toContainEqual(signedOut("anthropic"));
  });

  test("names the provider the CARD holds, once, for a multi-gateway sign-out", async () => {
    const client = await withAgent();

    const events = await busEvents(() => client.providerLogout("opencode"));

    expect(events).toEqual([signedOut("opencode")]);
  });
});

describe("the pasted API key", () => {
  test("POSTs provider + key in the body, never in the URL", async () => {
    const client = await withAgent();

    await client.setProviderApiKey("mistral", KEY);

    const call = expectWrite(
      `${BASE}/agents/${AGENT}/credential/api-key`,
      JSON.stringify({ provider: "mistral", apiKey: KEY }),
    );
    expect(call.url).not.toContain(KEY);
  });

  test("carries the optional endpoint only when one was given", async () => {
    const client = await withAgent();

    await client.setProviderApiKey("azure", KEY, "https://az.example");

    expectWrite(
      `${BASE}/agents/${AGENT}/credential/api-key`,
      JSON.stringify({
        provider: "azure",
        apiKey: KEY,
        endpoint: "https://az.example",
      }),
    );
  });

  test("stores the key on the setup runtime before any agent exists", async () => {
    const client = await withNoAgent();

    await client.setProviderApiKey("mistral", KEY);

    const call = expectWrite(
      `${BASE}/setup-runtime/credential/api-key`,
      JSON.stringify({ provider: "mistral", apiKey: KEY }),
    );
    expect(call.url).not.toContain(KEY);
  });
});

describe("the OpenAI-compatible server", () => {
  test("POSTs the endpoint to the host's SINGULAR /provider route", async () => {
    const client = await withAgent();
    const endpoint = { baseUrl: "http://localhost:1234/v1", model: "llama" };

    await client.setProviderCustomEndpoint(endpoint);

    const call = expectWrite(
      `${BASE}/agents/${AGENT}/provider/openai-compatible`,
      JSON.stringify(endpoint),
    );
    expect(call.url).not.toContain("/providers/openai-compatible");
  });
});

describe("the agent id in the path", () => {
  test("is percent-encoded, and that is the whole URL", async () => {
    const client = await settled([wireAgent("Houston/Bo")]);

    await client.providerLogout("anthropic");

    expect(credentialCalls()[0].url).toBe(
      `${BASE}/agents/Houston%2FBo/credential/forget`,
    );
  });
});
