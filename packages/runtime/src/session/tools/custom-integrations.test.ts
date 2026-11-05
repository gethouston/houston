import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { makeCustomIntegrationTools } from "./custom-integrations";

/**
 * The custom-integration setup procedure rides on the setup tools' own
 * results (the product prompt keeps only the research that comes before
 * detect), so each step must arrive at the point in the setup where it applies.
 */

const ctx = {} as unknown as ExtensionToolContext;

function toolsAnswering(body: unknown) {
  const call = async () =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  const [detect, add] = makeCustomIntegrationTools({ call });
  const run = (tool: typeof detect, params: unknown) =>
    tool
      .execute("id", params as never, undefined, undefined, ctx)
      .then((out) => (out.content[0] as { text: string }).text);
  return {
    detect: (p: unknown) => run(detect, p),
    add: (p: unknown) => run(add, p),
  };
}

test("a detect result carries the rest of the setup procedure", async () => {
  const { detect } = toolsAnswering({
    kind: "openapi",
    name: "Acme",
    requiresAuthentication: true,
  });
  const text = await detect({ url: "https://acme.example/openapi.json" });
  expect(text).toContain(
    "Next: call custom_integration_add with kind 'openapi'.",
  );
  expect(text).toContain(
    "pass its URL as `url` to custom_integration_add; never retype or trim it",
  );
  expect(text).toContain("covering EVERY operation it describes");
  expect(text).toContain("Add the integration ONCE");
  expect(text).toContain("one integration per service");
});

test("an unreadable URL keeps the agent researching before it asks the user", async () => {
  const { detect } = toolsAnswering({ kind: "unknown" });
  const text = await detect({ url: "https://acme.example/docs" });
  expect(text).toContain(
    "ask the user for its documentation URL only when your own search found nothing",
  );
  expect(text).toContain(
    "When it publishes none, write a complete OpenAPI 3 document",
  );
});

test("an active add asks for the coverage check and a read-only test before 'it works'", async () => {
  const { add } = toolsAnswering({
    slug: "acme",
    name: "Acme",
    state: { status: "active", toolCount: 5 },
  });
  const text = await add({ kind: "openapi", name: "Acme", auth: "none" });
  expect(text).toContain("with 5 available actions");
  expect(text).toContain(
    "Check this count against the operations the documentation describes.",
  );
  expect(text).toContain("verify it with one harmless read-only action");
});
