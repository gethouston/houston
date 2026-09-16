import { expect, test } from "vitest";
import { FakeIntegrationProvider } from "../integrations/fake";
import { IntegrationRegistry } from "../integrations/registry";
import { executeIntegration, searchIntegrations } from "./integrations-fanout";

test("search fan-out keeps healthy provider results", async () => {
  const failed = new FakeIntegrationProvider({ id: "custom" });
  failed.throwSearchExecute = new Error("offline");
  const healthy = new FakeIntegrationProvider({
    id: "composio",
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

test("a scope naming a custom integration EXACTLY is served by custom alone: no fuzzy Composio neighbour", async () => {
  // PRODUCT-1841: "COMFER Odoo 19 JSON-2" also matched Composio's `odoo`
  // toolkit by substring, so a dozen turned-off ODOO_* rows were listed ahead
  // of the user's own integration and the model read them as the catalog.
  const composio = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      {
        action: "ODOO_CALL_ODOO_JSONRPC",
        toolkit: "odoo",
        description: "JSON-RPC endpoint",
      },
    ],
  });
  const custom = new FakeIntegrationProvider({
    id: "custom",
    toolkits: [
      { slug: "comfer_odoo_19_json_2", name: "COMFER Odoo 19 JSON-2" },
    ],
    actions: [
      {
        action: "tools.comfer_odoo_19_json_2.org.default.json.getSaleOrder",
        toolkit: "comfer_odoo_19_json_2",
        description: "Read sale.order",
        connected: true,
        status: "connected",
      },
    ],
  });
  for (const app of ["COMFER Odoo 19 JSON-2", "comfer_odoo_19_json_2"]) {
    composio.lastApp = undefined;
    const result = await searchIntegrations({
      registry: new IntegrationRegistry([composio, custom]),
      userId: "user",
      query: "getSaleOrder",
      app,
    });
    expect(result.items.map((item) => item.action)).toEqual([
      "tools.comfer_odoo_19_json_2.org.default.json.getSaleOrder",
    ]);
    expect(composio.lastApp).toBeUndefined();
  }
  // A scope no custom integration names exactly still fans out to everyone.
  const loose = await searchIntegrations({
    registry: new IntegrationRegistry([composio, custom]),
    userId: "user",
    query: "jsonrpc",
    app: "odoo",
  });
  expect(loose.items.map((item) => item.action)).toContain(
    "ODOO_CALL_ODOO_JSONRPC",
  );
  expect(composio.lastApp).toBe("odoo");
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
