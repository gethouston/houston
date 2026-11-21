import { expect, test } from "vitest";
import { pushApiKeyCredential } from "./op-credential";

test("the pool-op push carries azure's endpoint on the central row (PRODUCT-1532)", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  expect(
    await pushApiKeyCredential({
      credentialsBaseUrl: "http://gateway.test",
      orgSlug: "org",
      agentSlug: "agent",
      hostToken: "host-token",
      provider: "azure-openai-responses",
      apiKey: "azure-key",
      enterpriseUrl: "https://acme.openai.azure.com",
      fetchImpl,
    }),
  ).toBeNull();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    kind: "api_key",
    access: "azure-key",
    enterpriseUrl: "https://acme.openai.azure.com",
  });

  await pushApiKeyCredential({
    credentialsBaseUrl: "http://gateway.test",
    orgSlug: "org",
    agentSlug: "agent",
    hostToken: "host-token",
    provider: "openrouter",
    apiKey: "or-key",
    fetchImpl,
  });
  expect(bodies[1]).not.toHaveProperty("enterpriseUrl");
});
