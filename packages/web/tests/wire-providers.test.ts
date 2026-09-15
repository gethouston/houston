import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { wireAgent } from "./support/agent-list";
import {
  type Call,
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The WORKSPACE-CENTRAL credential writes — connect-once capture, the desktop's
 * Claude push, sign-out, the pasted API key and the OpenAI-compatible server,
 * each in its per-agent and its agentless (`/setup-runtime`) spelling — ride
 * `sdk.providers.credentials`.
 *
 * What these pin is the wire, because the routes are the host's connect-once
 * surface and the SDK also carries a RUNTIME provider surface
 * (`sdk.providers.writes`, `/agents/:id/auth/…`) that looks like it would do.
 * It would not: a write there touches one pod's `auth.json` and leaves the
 * central store — which every agent in the space serves from — untouched, so
 * the next turn re-hydrates the agent and undoes it. Sending the same bytes as
 * before is therefore the whole contract, and each assertion below states them
 * whole: the URL, the method, the body, and the three headers the gateway
 * routes on.
 *
 * SECRETS: every one of these calls carries a pasted key or a minted OAuth
 * credential, and each test asserts it appears in the BODY and nowhere in the
 * URL — the path carries only ids, so nothing reaches a log line that records
 * a request path. `credential-write-urls.test.ts` holds the matching rule that
 * no scope ever re-enters the URL.
 */

const BASE = "http://host";
const AGENT = "agent-1";
/** A key shaped like a real one, so a leak into a URL is unmistakable. */
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

/**
 * A hosted client whose active space has already listed `agents` — provider
 * writes refuse to route until that settles (HOU-979). Every request answers
 * `200 {}`; the recorder is emptied afterwards, so a test reads only its own
 * calls.
 */
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

/** The client of a space that HAS an agent, and of one that has none. */
const withAgent = () => settled([wireAgent(AGENT)]);
const withNoAgent = () => settled([]);

/** The credential-store calls, isolated from the runtime calls beside them. */
const credentialCalls = (): Call[] =>
  calls.filter(
    (call) =>
      call.url.includes("/credential/") ||
      call.url.includes("/provider/openai-compatible"),
  );

/** Assert one credential write, whole: URL, method, body bytes, headers. */
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

  test("sends NO body when no provider is named, as the control-plane copy did", async () => {
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
    // The central store is cleared BEFORE the pod's own auth.json, so no
    // in-flight turn can re-serve the credential the sign-out just dropped.
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
    // Not `/providers/openai-compatible`, which is the RUNTIME's own route
    // (`sdk.providers.writes.setCustomEndpoint`) and a different host.
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
