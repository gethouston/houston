import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The integrations family served by `@houston/sdk`: the provider-scoped reads,
 * the trigger catalog, the user's own custom connectors, and the per-agent
 * dispatch form of the same connectors.
 *
 * Each call MUST issue exactly the request recorded here — same method, path,
 * body bytes, and headers (`Content-Type`,
 * `Authorization` bearer, the live `x-houston-org`) — over the ONE shared
 * gateway fetch, as a SINGLE request (no post-write refetch).
 *
 * The two 404 dispositions stay adapter-side and are asserted here beside the
 * wire: a BARE 404 on a definitions/tools read means the deployment does not
 * serve the feature (→ null), while `{code:"not_found"}` means an unknown slug
 * and is a real failure.
 */

const BASE = "http://host";

const { calls, reset, restore, stubResponses: stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

/** The one call the delegation made, asserted whole. */
function onlyCall(method: string, url: string, body: string | null = null) {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.method).toBe(method);
  expect(call.url).toBe(url);
  expect(call.body).toBe(body);
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  return call;
}

// ---- provider-scoped reads ----

test("integrationStatus delegates a single GET /v1/integrations and unwraps items", async () => {
  stubFetch(json(200, { items: [{ provider: "composio", ready: true }] }));

  const c = client();
  c.setActiveOrg(ORG);
  const out = await c.integrationStatus();

  const call = onlyCall("GET", `${BASE}/v1/integrations`);
  expect(call.headers.get("x-houston-org")).toBe(ORG);
  expect(out).toEqual([{ provider: "composio", ready: true }]);
});

test("integrationToolkits keeps the {provider} segment and unwraps items", async () => {
  stubFetch(json(200, { items: [{ slug: "gmail", name: "Gmail" }] }));

  const out = await client().integrationToolkits("composio");

  onlyCall("GET", `${BASE}/v1/integrations/composio/toolkits`);
  expect(out).toEqual([{ slug: "gmail", name: "Gmail" }]);
});

test("integrationConnections asks the provider the caller named, not composio", async () => {
  stubFetch(json(200, { items: [] }));

  await client().integrationConnections("custom");

  onlyCall("GET", `${BASE}/v1/integrations/custom/connections`);
});

test("integrationConnection percent-encodes the connection id", async () => {
  stubFetch(
    json(200, { toolkit: "gmail", connectionId: "c/1", status: "active" }),
  );

  await client().integrationConnection("composio", "c/1");

  onlyCall("GET", `${BASE}/v1/integrations/composio/connections/c%2F1`);
});

test("triggerTypes carries the toolkit as an escaped query value", async () => {
  stubFetch(json(200, { items: [] }));

  await client().triggerTypes("git hub");

  onlyCall(
    "GET",
    `${BASE}/v1/integrations/composio/trigger-types?toolkit=git%20hub`,
  );
});

// ---- custom connectors, user-scoped form ----

test("customIntegrations delegates a single GET of the definitions list", async () => {
  stubFetch(json(200, { items: [{ slug: "acme" }] }));

  const out = await client().customIntegrations();

  onlyCall("GET", `${BASE}/v1/integrations/custom/definitions`);
  expect(out).toEqual([{ slug: "acme" }]);
});

test("addCustomIntegration posts the input verbatim", async () => {
  stubFetch(json(200, { slug: "acme" }));
  const input = {
    kind: "mcp" as const,
    name: "Acme",
    endpoint: "https://acme.test/mcp",
    auth: "none" as const,
  };

  const c = client();
  c.setActiveOrg(ORG);
  await c.addCustomIntegration(input);

  const call = onlyCall(
    "POST",
    `${BASE}/v1/integrations/custom/definitions`,
    JSON.stringify(input),
  );
  expect(call.headers.get("x-houston-org")).toBe(ORG);
});

test("removeCustomIntegration deletes the slug, percent-encoded", async () => {
  stubFetch(json(200, { ok: true }));

  await client().removeCustomIntegration("a/b");

  onlyCall("DELETE", `${BASE}/v1/integrations/custom/definitions/a%2Fb`);
});

test("updateCustomIntegrationDetails patches the user-scoped definition", async () => {
  stubFetch(json(200, { ok: true }));
  const details = { name: "Acme", website: "https://acme.test" };

  await client().updateCustomIntegrationDetails("acme", details);

  onlyCall(
    "PATCH",
    `${BASE}/v1/integrations/custom/definitions/acme`,
    JSON.stringify(details),
  );
});

test("submitCustomIntegrationCredential wraps the fields in {values}", async () => {
  stubFetch(json(200, { slug: "acme" }));

  await client().submitCustomIntegrationCredential("acme", { key: "s3cret" });

  onlyCall(
    "POST",
    `${BASE}/v1/integrations/custom/definitions/acme/credential`,
    JSON.stringify({ values: { key: "s3cret" } }),
  );
});

test("startCustomIntegrationOAuth posts the start route with no body", async () => {
  stubFetch(json(200, { authorizeUrl: "https://acme.test/auth" }));

  const out = await client().startCustomIntegrationOAuth("acme");

  onlyCall(
    "POST",
    `${BASE}/v1/integrations/custom/definitions/acme/oauth/start`,
  );
  expect(out).toEqual({ authorizeUrl: "https://acme.test/auth" });
});

test("customIntegrationTools reads one definition's compiled tools", async () => {
  stubFetch(json(200, { items: [{ name: "search" }] }));

  const out = await client().customIntegrationTools("acme");

  onlyCall("GET", `${BASE}/v1/integrations/custom/definitions/acme/tools`);
  expect(out).toEqual([{ name: "search" }]);
});

test("detectCustomIntegration posts the pasted url", async () => {
  stubFetch(json(200, { kind: "mcp" }));

  await client().detectCustomIntegration("https://acme.test/mcp");

  onlyCall(
    "POST",
    `${BASE}/v1/integrations/custom/detect`,
    JSON.stringify({ url: "https://acme.test/mcp" }),
  );
});

// ---- custom connectors, per-agent dispatch form ----

test("agentCustomIntegrations reads the agent's definitions list", async () => {
  stubFetch(json(200, { items: [{ slug: "acme" }] }));

  const out = await client().agentCustomIntegrations("a 1");

  onlyCall("GET", `${BASE}/agents/a%201/integrations/custom/definitions`);
  expect(out).toEqual([{ slug: "acme" }]);
});

test("addAgentCustomIntegration posts the input to the agent's route", async () => {
  stubFetch(json(200, { slug: "acme" }));
  const input = {
    kind: "openapi" as const,
    name: "Acme",
    url: "https://acme.test/openapi.json",
    auth: "none" as const,
  };

  await client().addAgentCustomIntegration("a1", input);

  onlyCall(
    "POST",
    `${BASE}/agents/a1/integrations/custom/definitions`,
    JSON.stringify(input),
  );
});

test("removeAgentCustomIntegration deletes the agent's definition", async () => {
  stubFetch(json(200, { ok: true }));

  await client().removeAgentCustomIntegration("a1", "a/b");

  onlyCall("DELETE", `${BASE}/agents/a1/integrations/custom/definitions/a%2Fb`);
});

test("updateCustomIntegrationDetails patches the agent's definition when given an agent", async () => {
  stubFetch(json(200, { ok: true }));
  const details = { name: "Acme", website: "https://acme.test" };

  await client().updateCustomIntegrationDetails("acme", details, "a1");

  onlyCall(
    "PATCH",
    `${BASE}/agents/a1/integrations/custom/definitions/acme`,
    JSON.stringify(details),
  );
});

test("submitAgentCustomIntegrationCredential wraps the fields in {values}", async () => {
  stubFetch(json(200, { slug: "acme" }));

  await client().submitAgentCustomIntegrationCredential("a1", "acme", {
    key: "s3cret",
  });

  onlyCall(
    "POST",
    `${BASE}/agents/a1/integrations/custom/definitions/acme/credential`,
    JSON.stringify({ values: { key: "s3cret" } }),
  );
});

test("startAgentCustomIntegrationOAuth posts the agent's start route", async () => {
  stubFetch(json(200, { authorizeUrl: "https://acme.test/auth" }));

  await client().startAgentCustomIntegrationOAuth("a1", "acme");

  onlyCall(
    "POST",
    `${BASE}/agents/a1/integrations/custom/definitions/acme/oauth/start`,
  );
});

test("agentCustomIntegrationTools reads the agent's compiled tools", async () => {
  stubFetch(json(200, { items: [{ name: "search" }] }));

  const out = await client().agentCustomIntegrationTools("a1", "acme");

  onlyCall(
    "GET",
    `${BASE}/agents/a1/integrations/custom/definitions/acme/tools`,
  );
  expect(out).toEqual([{ name: "search" }]);
});

test("detectAgentCustomIntegration posts the pasted url to the agent", async () => {
  stubFetch(json(200, { kind: "mcp" }));

  await client().detectAgentCustomIntegration("a1", "https://acme.test/mcp");

  onlyCall(
    "POST",
    `${BASE}/agents/a1/integrations/custom/detect`,
    JSON.stringify({ url: "https://acme.test/mcp" }),
  );
});

// ---- the two 404 dispositions, which stay adapter-side ----

test("a bare 404 on either definitions list means the feature is absent", async () => {
  stubFetch(json(404, {}), json(404, {}));
  const c = client();

  expect(await c.customIntegrations()).toBeNull();
  expect(await c.agentCustomIntegrations("a1")).toBeNull();
  expect(calls).toHaveLength(2);
});

test("a bare 404 on a tools read hides the feature, not_found is a real failure", async () => {
  stubFetch(json(404, {}), json(404, { code: "not_found" }));
  const c = client();

  expect(await c.customIntegrationTools("acme")).toBeNull();
  await expect(c.customIntegrationTools("gone")).rejects.toMatchObject({
    status: 404,
  });
});

test("the per-agent tools read splits the same two 404 answers", async () => {
  stubFetch(json(404, {}), json(404, { code: "not_found" }));
  const c = client();

  expect(await c.agentCustomIntegrationTools("a1", "acme")).toBeNull();
  await expect(
    c.agentCustomIntegrationTools("a1", "gone"),
  ).rejects.toMatchObject({ status: 404 });
});

test("a custom write never degrades a 404", async () => {
  stubFetch(json(404, {}));

  await expect(client().removeCustomIntegration("acme")).rejects.toMatchObject({
    status: 404,
  });
});
