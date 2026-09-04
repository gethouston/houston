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

test("the custom provider's bare connect row is dropped when another provider offers the app; tools and connected rows stay", async () => {
  const composioRow = {
    action: "HIGHLEVEL_CREATE_CONTACT",
    toolkit: "highlevel",
    description: "Create a contact",
  };
  const composio = new FakeIntegrationProvider({
    id: "composio",
    actions: [composioRow],
  });
  const connectRow = {
    action: "",
    toolkit: "highlevel",
    description: "HighLevel CRM contact tools",
    connected: false,
    status: "connectable" as const,
  };
  const offering = new FakeIntegrationProvider({
    id: "custom",
    actions: [connectRow],
  });
  const both = await searchIntegrations({
    registry: new IntegrationRegistry([composio, offering]),
    userId: "user",
    query: "contact",
  });
  expect(both.items.map((item) => item.action)).toEqual([
    "HIGHLEVEL_CREATE_CONTACT",
  ]);
  // Custom alone still offers the connect (the only path there is).
  const alone = await searchIntegrations({
    registry: new IntegrationRegistry([offering]),
    userId: "user",
    query: "contact",
  });
  expect(alone.items.map((item) => item.toolkit)).toEqual(["highlevel"]);
  // A compiled custom tool for the same app is never a duplicate offer.
  const compiled = new FakeIntegrationProvider({
    id: "custom",
    actions: [
      {
        action: "tools.highlevel.contacts_create-contact",
        toolkit: "highlevel",
        description: "Create a contact",
      },
    ],
  });
  const withTools = await searchIntegrations({
    registry: new IntegrationRegistry([composio, compiled]),
    userId: "user",
    query: "contact",
  });
  expect(withTools.items.map((item) => item.action)).toEqual([
    "HIGHLEVEL_CREATE_CONTACT",
    "tools.highlevel.contacts_create-contact",
  ]);
});

test("a curated alias scope reaches other providers as the real slug", async () => {
  const composio = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      {
        action: "HIGHLEVEL_CREATE_CONTACT",
        toolkit: "highlevel",
        description: "Create a contact",
      },
      { action: "GMAIL_SEND_EMAIL", toolkit: "gmail", description: "Send" },
    ],
  });
  const started = await composio.connect("user", "highlevel");
  composio.completeConnection("user", started.connectionId);
  const result = await searchIntegrations({
    registry: new IntegrationRegistry([composio]),
    userId: "user",
    query: "contact",
    app: "leadconnector",
  });
  expect(result.items.map((item) => item.action)).toEqual([
    "HIGHLEVEL_CREATE_CONTACT",
  ]);
  expect(result.items[0]?.connected).toBe(true);
  expect(composio.lastApp).toBe("highlevel");
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
