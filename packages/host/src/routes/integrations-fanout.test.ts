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

test("a curated toolkit is OFFERED through custom only; connected rows and a custom outage keep the other provider's rows", async () => {
  const highlevelRow = {
    action: "HIGHLEVEL_CREATE_CONTACT",
    toolkit: "highlevel",
    description: "Create a contact",
    connected: false,
  };
  const composio = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      highlevelRow,
      {
        action: "GMAIL_SEND_EMAIL",
        toolkit: "gmail",
        description: "Email a contact",
      },
    ],
  });
  const custom = new FakeIntegrationProvider({
    id: "custom",
    actions: [
      {
        action: "tools.highlevel.contacts_create-contact",
        toolkit: "highlevel",
        description: "Create a contact",
      },
    ],
  });
  const both = await searchIntegrations({
    registry: new IntegrationRegistry([composio, custom]),
    userId: "user",
    query: "contact",
  });
  expect(both.items.map((item) => item.action)).toEqual([
    "GMAIL_SEND_EMAIL",
    "tools.highlevel.contacts_create-contact",
  ]);
  // Without custom registered, Composio's row is the only path and stays.
  const alone = await searchIntegrations({
    registry: new IntegrationRegistry([composio]),
    userId: "user",
    query: "contact",
  });
  expect(alone.items.map((item) => item.action)).toContain(
    "HIGHLEVEL_CREATE_CONTACT",
  );
  // An account already connected through Composio keeps its actions.
  const connectedComposio = new FakeIntegrationProvider({
    id: "composio",
    actions: [highlevelRow],
  });
  const started = await connectedComposio.connect("user", "highlevel");
  connectedComposio.completeConnection("user", started.connectionId);
  const kept = await searchIntegrations({
    registry: new IntegrationRegistry([connectedComposio, custom]),
    userId: "user",
    query: "contact",
  });
  expect(kept.items.map((item) => item.action)).toContain(
    "HIGHLEVEL_CREATE_CONTACT",
  );
  // A custom outage never hides the offer that is up.
  const down = new FakeIntegrationProvider({ id: "custom" });
  down.throwSearchExecute = new Error("offline");
  const outage = await searchIntegrations({
    registry: new IntegrationRegistry([composio, down]),
    userId: "user",
    query: "contact",
  });
  expect(outage.items.map((item) => item.action)).toContain(
    "HIGHLEVEL_CREATE_CONTACT",
  );
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
