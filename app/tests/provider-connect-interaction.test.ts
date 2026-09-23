import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
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

const readSrc = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("the card keys its memory by the whole request, never the bare step id", () => {
  // The engine numbers steps per TURN, so "p1" names the first provider request
  // of every turn of every conversation: keyed on it alone, one connect
  // answered for every later request in the app run and the chat hung.
  const card = readSrc(
    "../src/components/chat-provider-connect-interaction-card.tsx",
  );
  ok(
    card.includes("providerConnectStepKey({ agentId, conversationId"),
    "the card composes agent + conversation + provider + step",
  );
  ok(
    card.includes("forgetProviderConnectStep(stepKey)"),
    "an answered step is forgotten, so a later request starts live",
  );
  const panel = readSrc("../src/components/use-agent-chat-panel.tsx");
  ok(
    panel.includes("conversationId: selectedSessionKey"),
    "the panel supplies the conversation half of the identity",
  );
  ok(
    panel.includes("releaseProviderConnectStepResumes("),
    "a resume whose turn never sent gives its claim back",
  );
});

test("a requested provider is named through the gated connect list", () => {
  // The card resolves through `getConnectProviders`; a title resolved off the
  // raw catalog named a provider the card itself reports as unavailable.
  const steps = readSrc("../src/components/chat-interaction-steps.ts");
  ok(
    steps.includes("title: resolveProviderName(step.provider)"),
    "the mapped title uses the gated resolver",
  );
  ok(
    !steps.includes('from "../lib/providers"'),
    "the raw catalog lookup is gone from the step mapper",
  );
});
