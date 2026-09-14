import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import type { PendingInteraction } from "@houston/protocol";
import {
  deriveActiveInteraction,
  interactionNotificationBodyKey,
} from "../src/lib/active-interaction.ts";
import { finalConnectNames } from "../src/lib/interaction-outcomes.ts";
import { resolvePlanReadyOverride } from "../src/lib/plan-ready.ts";

const interaction: PendingInteraction = {
  steps: [
    {
      kind: "provider_connect",
      id: "pc1",
      provider: "openrouter",
      reason: "Use your OpenRouter account.",
    },
  ],
};

test("restored provider requests remain blocking without a manager activity row", () => {
  strictEqual(
    deriveActiveInteraction({
      running: false,
      live: interaction,
      persisted: undefined,
      missionStatus: undefined,
    }),
    interaction,
  );
  deepStrictEqual(resolvePlanReadyOverride(interaction.steps, null), {
    kind: "stepper",
    steps: interaction.steps,
  });
  strictEqual(
    interactionNotificationBodyKey(interaction),
    "sessionComplete.connect",
  );
  strictEqual(
    deriveActiveInteraction({
      running: true,
      live: interaction,
      persisted: undefined,
      missionStatus: undefined,
    }),
    null,
  );
});

test("provider and app connections preserve final outcomes in sequence order", () => {
  const outcomes = new Map([
    [
      "pc1",
      { name: "OpenRouter", connected: false, message: "Use Claude instead" },
    ],
    ["c1", { name: "Gmail", connected: true }],
  ]);
  deepStrictEqual(finalConnectNames(["pc1", "c1"], outcomes), {
    connectedNames: ["Gmail"],
    skippedConnectNames: [],
    connectRedirects: [{ name: "OpenRouter", text: "Use Claude instead" }],
  });
  outcomes.set("pc1", { name: "OpenRouter", connected: true });
  deepStrictEqual(finalConnectNames(["pc1", "c1"], outcomes), {
    connectedNames: ["OpenRouter", "Gmail"],
    skippedConnectNames: [],
    connectRedirects: [],
  });
});
