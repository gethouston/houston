import { deepStrictEqual } from "node:assert";
import { test } from "node:test";
import { HoustonClient } from "../src/client.ts";

test("custom detail updates preserve the target ID on direct and hosted routes", async () => {
  const calls: unknown[] = [];
  const client = new HoustonClient({
    baseUrl: "http://localhost:9999",
    token: "tok",
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: JSON.parse(String(init?.body)),
      });
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  const details = { name: "Spark", website: "https://spark.studioroda.co" };
  await client.updateCustomIntegrationDetails("original-id", details);
  await client.updateCustomIntegrationDetails(
    "original-id",
    details,
    "agent one",
  );
  deepStrictEqual(calls, [
    {
      url: "http://localhost:9999/v1/integrations/custom/definitions/original-id",
      method: "PATCH",
      body: details,
    },
    {
      url: "http://localhost:9999/v1/agents/agent%20one/integrations/custom/definitions/original-id",
      method: "PATCH",
      body: details,
    },
  ]);
});
