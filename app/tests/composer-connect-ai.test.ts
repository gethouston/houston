import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  type ConnectAiComposerSignals,
  shouldReplaceComposerWithConnectAi,
} from "../src/lib/composer-connect-ai.ts";

/**
 * The composer's connect-AI empty state.
 *
 * The bug: with NO provider connected the composer still rendered its full
 * input row — a model picker showing a phantom model (the effective-provider
 * default resolves to `anthropic` whether or not anyone is logged in) and a
 * textarea that accepted a message no provider could answer. The fix replaces
 * the whole input area with one CTA into the AI Hub.
 *
 * What these pin is the ANTI-FLASH half of it. "Zero connected" is a claim only
 * a settled world can make, and a composer that vanishes on boot and comes back
 * a beat later reads as a broken app. So every uncertain signal — probe
 * loading, probe errored, a provider still "checking", a half-hydrated catalog
 * or capabilities — must keep the normal composer.
 */

/** A settled, genuinely empty world: every gate open, nothing connected. */
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

/**
 * The wiring these three lock is not derivable from the pure helper, and the
 * node test runner has no DOM — so they assert on component source, the repo's
 * idiom for React contracts (see `card-unification.test.ts`).
 */
const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

test("the empty state replaces the composer rather than stacking above it", () => {
  const src = read("../src/components/use-agent-chat-panel.tsx");
  assert.match(
    src,
    /if \(connectAiComposer\.node\)\s*\n?\s*return \{ mode: "replace" as const, node: connectAiComposer\.node \};/,
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
  // Split around the interpolation so this assertion is not itself a template
  // placeholder in a plain string (which biome rightly flags).
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
