import { expect, test } from "vitest";
import { FakeIntegrationProvider } from "./fake";
import { IntegrationRegistry } from "./registry";
import {
  mergeSearchAccounts,
  mergeSearchItems,
  type ProviderSearch,
  searchAllProviders,
} from "./sandbox-fanout";

function twoProviderRegistry() {
  const composio = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      { action: "GMAIL_SEND_EMAIL", toolkit: "gmail", description: "send" },
    ],
  });
  const custom = new FakeIntegrationProvider({
    id: "custom",
    actions: [
      {
        action: "CUSTOM_ACME_REQUEST",
        toolkit: "acme",
        description: "acme http",
      },
    ],
  });
  return {
    composio,
    custom,
    registry: new IntegrationRegistry([composio, custom]),
  };
}

test("searchAllProviders fans out and tags each match with its provider", async () => {
  const { registry } = twoProviderRegistry();
  const searches = await searchAllProviders(registry, "u", "", undefined);
  const items = mergeSearchItems(searches);
  expect(items.map((i) => [i.action, i.provider])).toEqual([
    ["GMAIL_SEND_EMAIL", "composio"],
    ["CUSTOM_ACME_REQUEST", "custom"],
  ]);
});

test("searchAllProviders rejects the whole call on any provider error (no partials)", async () => {
  const { custom, registry } = twoProviderRegistry();
  custom.throwSearchExecute = new Error("upstream boom");
  await expect(
    searchAllProviders(registry, "u", "", undefined),
  ).rejects.toThrow(/upstream boom/);
});

test("mergeSearchItems overwrites any adapter-set provider with the registry id", () => {
  const searches: ProviderSearch[] = [
    {
      id: "custom",
      result: {
        items: [
          {
            action: "CUSTOM_X_REQUEST",
            toolkit: "x",
            description: "",
            provider: "stale",
          },
        ],
      },
    },
  ];
  expect(mergeSearchItems(searches)[0]?.provider).toBe("custom");
});

test("mergeSearchAccounts concatenates provider-attached accounts", () => {
  const searches: ProviderSearch[] = [
    {
      id: "composio",
      result: {
        items: [],
        accounts: [{ toolkit: "gmail", connectionId: "c1" }],
      },
    },
    { id: "custom", result: { items: [] } },
    {
      id: "custom",
      result: {
        items: [],
        accounts: [{ toolkit: "acme", connectionId: "acme" }],
      },
    },
  ];
  expect(mergeSearchAccounts(searches).map((a) => a.connectionId)).toEqual([
    "c1",
    "acme",
  ]);
});
