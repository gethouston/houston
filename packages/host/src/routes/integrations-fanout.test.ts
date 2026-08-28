import { expect, test } from "vitest";
import { FakeIntegrationProvider } from "../integrations/fake";
import { IntegrationRegistry } from "../integrations/registry";
import { executeIntegration, searchIntegrations } from "./integrations-fanout";

test("search fan-out keeps healthy provider results", async () => {
  const failed = new FakeIntegrationProvider({ id: "failed" });
  failed.throwSearchExecute = new Error("offline");
  const healthy = new FakeIntegrationProvider({
    id: "healthy",
    actions: [
      {
        action: "SLACK_SEND_MESSAGE",
        toolkit: "slack",
        description: "Send a message",
      },
    ],
  });
  const result = await searchIntegrations({
    registry: new IntegrationRegistry([failed, healthy]),
    userId: "user",
    query: "message",
  });
  expect(result.items.map((item) => item.action)).toEqual([
    "SLACK_SEND_MESSAGE",
  ]);
});

test("execute routes tools-prefixed actions to custom", async () => {
  const custom = new FakeIntegrationProvider({ id: "custom" });
  const composio = new FakeIntegrationProvider({ id: "composio" });
  const result = await executeIntegration({
    registry: new IntegrationRegistry([composio, custom]),
    userId: "user",
    action: "tools.acme.owner.default.run",
    params: { value: 1 },
    acting: { actingAs: "turn-token" },
  });
  expect(result).toEqual({
    successful: true,
    data: { action: "tools.acme.owner.default.run", params: { value: 1 } },
  });
  expect(custom.lastActing).toEqual({ actingAs: "turn-token" });
  expect(composio.lastActing).toBeUndefined();
});
