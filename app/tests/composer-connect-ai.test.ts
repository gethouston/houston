import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import {
  type ConnectAiComposerSignals,
  providerConnectionCounts,
  shouldReplaceComposerWithConnectAi,
  shouldShowConnectAiEmptyState,
} from "../src/lib/composer-connect-ai.ts";
import { connectAiGateState } from "../src/lib/connect-ai-gate.ts";

const settledEmpty: ConnectAiComposerSignals = {
  statusesLoading: false,
  statusesError: false,
  connectedCount: 0,
  checkingCount: 0,
  catalogReady: true,
  capabilitiesLoaded: true,
};

test("a settled world with zero connected providers replaces the composer", () => {
  assert.equal(shouldReplaceComposerWithConnectAi(settledEmpty), true);
});

test("a still-loading provider probe keeps the composer", () => {
  assert.equal(
    shouldReplaceComposerWithConnectAi({
      ...settledEmpty,
      statusesLoading: true,
    }),
    false,
  );
});

test("a failed provider probe keeps the composer (it knows nothing, not zero)", () => {
  assert.equal(
    shouldReplaceComposerWithConnectAi({
      ...settledEmpty,
      statusesError: true,
    }),
    false,
  );
});

test("a provider still checking keeps the composer", () => {
  assert.equal(
    shouldReplaceComposerWithConnectAi({ ...settledEmpty, checkingCount: 1 }),
    false,
  );
});

test("an unhydrated provider catalog keeps the composer", () => {
  assert.equal(
    shouldReplaceComposerWithConnectAi({
      ...settledEmpty,
      catalogReady: false,
    }),
    false,
  );
});

test("capabilities still loading keeps the composer", () => {
  assert.equal(
    shouldReplaceComposerWithConnectAi({
      ...settledEmpty,
      capabilitiesLoaded: false,
    }),
    false,
  );
});

test("one connected provider keeps the composer", () => {
  assert.equal(
    shouldReplaceComposerWithConnectAi({ ...settledEmpty, connectedCount: 1 }),
    false,
  );
});

test("a connected provider wins even while another is still checking", () => {
  assert.equal(
    shouldReplaceComposerWithConnectAi({
      ...settledEmpty,
      connectedCount: 1,
      checkingCount: 1,
    }),
    false,
  );
});

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

test("the empty state replaces the composer rather than stacking above it", () => {
  const src = read("../src/components/use-agent-chat-panel.tsx");
  assert.match(
    src,
    /shouldShowConnectAiEmptyState\([\s\S]*?return \{ mode: "replace" as const, node: connectAiComposer\.node \};/,
    "the connect-AI branch returns replace mode, which hides the whole ChatInput",
  );
});

test("the reconnect card is suppressed while the empty state owns the CTA", () => {
  const src = read("../src/components/use-agent-chat-panel.tsx");
  const afterMessages = src.slice(src.indexOf("const afterMessages"));
  const suppression = afterMessages.indexOf(
    "if (connectAiComposer.active) return null;",
  );
  const card = afterMessages.indexOf("<ProviderReconnectCard");
  assert.ok(
    suppression > -1,
    "afterMessages bails out on the connect-AI state",
  );
  assert.ok(
    suppression < card,
    "it bails out BEFORE rendering the reconnect card, so only one CTA shows",
  );
});

test("the empty state reuses the picker's no-providers copy", () => {
  const src = read("../src/components/chat-connect-ai-empty-state.tsx");
  assert.ok(
    src.includes("modelSelector.picker.noProviders.action"),
    "the CTA label is the picker's existing action key",
  );
  const perVariant = (leaf: string) =>
    `modelSelector.picker.noProviders.$\{variant}.${leaf}`;
  assert.ok(
    src.includes(perVariant("title")),
    "the title is the picker's existing per-variant key",
  );
  assert.ok(
    src.includes(perVariant("hint")),
    "the hint is the picker's existing per-variant key",
  );
  assert.ok(
    src.includes("onConnect ? ("),
    "no button at all for a viewer who cannot reach the AI Hub",
  );
});

test("a pending provider connection stays reachable with no AI connected", () => {
  const providerStep = {
    kind: "provider_connect" as const,
    id: "pc1",
    provider: "openrouter",
  };
  assert.equal(
    shouldShowConnectAiEmptyState(true, { steps: [providerStep] }),
    false,
  );
  assert.equal(shouldShowConnectAiEmptyState(true, null), true);
  assert.equal(
    shouldShowConnectAiEmptyState(true, {
      steps: [{ kind: "connect", id: "c1", toolkit: "gmail" }],
    }),
    true,
  );
  assert.equal(shouldShowConnectAiEmptyState(false, null), false);
});

test("the counts come off the one connection derivation", () => {
  assert.deepEqual(
    providerConnectionCounts({
      anthropic: { cli_installed: true, auth_state: "authenticated" },
      openai: { cli_installed: true, auth_state: "unauthenticated" },
      gemini: { cli_installed: true, auth_state: "unknown" },
      legacy: { cli_installed: true, authenticated: true },
    }),
    { connectedCount: 2, checkingCount: 1 },
  );
  assert.deepEqual(providerConnectionCounts({}), {
    connectedCount: 0,
    checkingCount: 0,
  });
});

describe("connectAiGateState", () => {
  const settled = {
    statusesLoading: false,
    statusesError: false,
    catalogReady: true,
    capabilities: null,
    capabilitiesLoaded: true,
    teamSpace: false,
  };
  const signedOut = {
    anthropic: { cli_installed: true, auth_state: "unauthenticated" as const },
  };

  test("offers Connect AI when a settled scan confirms nothing connected", () => {
    assert.deepEqual(connectAiGateState({ ...settled, statuses: signedOut }), {
      active: true,
      variant: "personal",
      canConnect: true,
    });
    assert.equal(
      connectAiGateState({ ...settled, statuses: signedOut, teamSpace: true })
        .variant,
      "team",
    );
  });

  test("keeps the normal start for one connected provider", () => {
    const statuses = {
      ...signedOut,
      openai: { cli_installed: true, auth_state: "authenticated" as const },
    };
    assert.equal(connectAiGateState({ ...settled, statuses }).active, false);
  });

  test("keeps the normal start while anything is uncertain", () => {
    const checking = {
      ...signedOut,
      gemini: { cli_installed: true, auth_state: "unknown" as const },
    };
    for (const input of [
      { ...settled, statuses: checking },
      { ...settled, statuses: signedOut, statusesLoading: true },
      { ...settled, statuses: signedOut, statusesError: true },
      { ...settled, statuses: signedOut, catalogReady: false },
      { ...settled, statuses: signedOut, capabilitiesLoaded: false },
    ])
      assert.equal(connectAiGateState(input).active, false);
  });

  test("never promises the AI Hub before the deployment described itself", () => {
    assert.equal(
      connectAiGateState({
        ...settled,
        statuses: signedOut,
        capabilitiesLoaded: false,
      }).canConnect,
      false,
    );
  });
});
