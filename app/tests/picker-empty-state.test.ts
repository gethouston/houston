import assert from "node:assert/strict";
import test from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import { pickerEmptyState } from "../src/components/chat-model-selector-labels.ts";

/**
 * HOU-979 — the chat picker's empty state, and who may act on it.
 *
 * Provider connections are ORG-level in a team space, so a plain member cannot
 * open the AI Models hub. The bug these pin: the decision read capabilities
 * that had not arrived yet, and the underlying role check answers TRUE for
 * absent capabilities (the single-player default) — so a member was shown a
 * Connect action for a beat and then had it swapped for "ask an admin". A
 * promise made and withdrawn is worse than no promise.
 */

const team = (role: OrgRole): Capabilities => ({
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  multiplayer: true,
  teams: true,
  role,
});

test("a personal space tells the personal story and offers the action", () => {
  assert.deepEqual(
    pickerEmptyState({
      teamSpace: false,
      capabilities: null,
      capabilitiesLoaded: true,
    }),
    { variant: "personal", canConnect: true },
  );
});

test("a team space viewed by an owner offers the action", () => {
  assert.deepEqual(
    pickerEmptyState({
      teamSpace: true,
      capabilities: team("owner"),
      capabilitiesLoaded: true,
    }),
    { variant: "teamCanConnect", canConnect: true },
  );
});

test("a team space viewed by a plain member names who can, and offers nothing", () => {
  assert.deepEqual(
    pickerEmptyState({
      teamSpace: true,
      capabilities: team("user"),
      capabilitiesLoaded: true,
    }),
    { variant: "teamAskAdmin", canConnect: false },
  );
});

test("withholds the action entirely until capabilities have LOADED", () => {
  // The regression: mid-fetch `capabilities` is null, which the role check
  // reads as single-player (permissive) — so the member briefly got a CTA.
  const midFetch = pickerEmptyState({
    teamSpace: true,
    capabilities: null,
    capabilitiesLoaded: false,
  });
  assert.equal(midFetch.canConnect, false);
  assert.equal(midFetch.variant, "teamAskAdmin");

  // Personal spaces are gated by the same rule, so no surface can offer an
  // action into a hub whose access we have not established yet.
  assert.equal(
    pickerEmptyState({
      teamSpace: false,
      capabilities: null,
      capabilitiesLoaded: false,
    }).canConnect,
    false,
  );
});

test("a capabilities load that FAILED settles on the single-player default", () => {
  // Failed is not pending: an undescribed deployment is the single-player one,
  // and pinning a lone desktop user at "ask an admin" would be its own bug.
  assert.deepEqual(
    pickerEmptyState({
      teamSpace: false,
      capabilities: null,
      capabilitiesLoaded: true,
    }),
    { variant: "personal", canConnect: true },
  );
});
