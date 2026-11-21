import assert from "node:assert/strict";
import test from "node:test";
import type { Capabilities, OrgRole } from "@houston/engine-adapter";
import { pickerEmptyState } from "../src/components/chat-model-selector-labels.ts";

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

test("a team space tells ONE story, whoever is looking (HOU-976)", () => {
  const owner = pickerEmptyState({
    teamSpace: true,
    capabilities: team("owner"),
    capabilitiesLoaded: true,
  });
  const member = pickerEmptyState({
    teamSpace: true,
    capabilities: team("user"),
    capabilitiesLoaded: true,
  });
  assert.deepEqual(owner, { variant: "team", canConnect: true });
  assert.deepEqual(member, owner);
});

test("withholds the action entirely until capabilities have LOADED", () => {
  const midFetch = pickerEmptyState({
    teamSpace: true,
    capabilities: null,
    capabilitiesLoaded: false,
  });
  assert.equal(midFetch.canConnect, false);
  assert.equal(midFetch.variant, "team");

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
  assert.deepEqual(
    pickerEmptyState({
      teamSpace: false,
      capabilities: null,
      capabilitiesLoaded: true,
    }),
    { variant: "personal", canConnect: true },
  );
});
