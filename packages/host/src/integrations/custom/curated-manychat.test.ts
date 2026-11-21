import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { MemoryCustomSecretStore } from "./secrets";
import type { CustomIntegrationDef } from "./types";

const SPEC = new URL(
  "../../../../../app/src/components/integrations/manychat-openapi.json",
  import.meta.url,
);

const def = (credential?: CustomIntegrationDef["credential"]) =>
  ({
    kind: "openapi",
    slug: "manychat",
    name: "ManyChat",
    spec: { kind: "blob", value: readFileSync(SPEC, "utf8") },
    baseUrl: "https://api.manychat.com",
    website: "https://manychat.com",
    auth: "credential",
    addedAtMs: 1,
    ...(credential ? { credential } : {}),
  }) satisfies CustomIntegrationDef;

test("without a key the entry lands pending with the spec's own bearer method", async () => {
  const host = new CustomExecutorHost(
    new MemoryCustomSecretStore(),
    async () => [def()],
  );
  const { executor, states } = await host.ensure();
  expect(states.get("manychat")).toMatchObject({
    status: "pending",
    authMethods: [{ fields: [{ variable: "token" }] }],
  });
  const integration = await executor.integrations.get("manychat");
  expect(integration?.authMethods).toMatchObject([
    {
      kind: "apikey",
      placements: [
        { carrier: "header", name: "Authorization", prefix: "Bearer " },
      ],
    },
  ]);
  await host.reset();
});

test("with a key the agent sees every operation under a readable name", async () => {
  const secrets = new MemoryCustomSecretStore();
  await secrets.set("ci_manychat_token", "123:secret");
  const host = new CustomExecutorHost(secrets, async () => [
    def({ template: "apikey-0", secretIds: { token: "ci_manychat_token" } }),
  ]);
  const { executor, states } = await host.ensure();
  expect(states.get("manychat")).toEqual({ status: "active", toolCount: 32 });
  const tools = (await executor.tools.list()).filter(
    (t) => t.integration === "manychat",
  );
  const names = tools.map((t) => t.name).sort();
  expect(names).toEqual(
    expect.arrayContaining([
      "page.getInfo",
      "page.getTags",
      "page.getFlows",
      "sending.sendContent",
      "sending.sendFlow",
      "subscriber.getInfo",
      "subscriber.findByName",
      "subscriber.findBySystemField",
      "subscriber.addTagByName",
      "subscriber.setCustomFieldByName",
      "subscriber.createSubscriber",
    ]),
  );
  for (const tool of tools) {
    expect(tool.name).toMatch(/^(page|sending|subscriber)\.[a-z][A-Za-z]+$/);
    expect(tool.description ?? "").not.toMatch(/^\*\*\*Limit/);
  }
  await host.reset();
});
