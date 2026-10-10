import { deepStrictEqual } from "node:assert";
import { test } from "node:test";
import { channelProviderCards } from "../src/components/settings/sections/channel-provider-cards.ts";

test("known provider cards render in stable order with their own accounts and readiness", () => {
  const status = {
    providers: [
      { id: "whatsapp" as const, name: "WhatsApp", configured: false },
      { id: "slack" as const, name: "Slack", configured: true },
    ],
    connections: [
      {
        id: "w",
        provider: "whatsapp" as const,
        accountLabel: "•••• 1111",
        spaceId: "personal",
        createdAt: "2026-09-24T12:00:00Z",
      },
      {
        id: "s",
        provider: "slack" as const,
        accountLabel: "Ada",
        spaceId: "personal",
        createdAt: "2026-09-24T12:00:00Z",
      },
    ],
  };
  const cards = channelProviderCards(status);
  deepStrictEqual(
    cards.map(({ provider }) => [provider.id, provider.configured]),
    [
      ["slack", true],
      ["whatsapp", false],
    ],
  );
  deepStrictEqual(
    cards.map(({ connections }) => connections.map(({ id }) => id)),
    [["s"], ["w"]],
  );
});
