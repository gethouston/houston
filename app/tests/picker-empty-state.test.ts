import assert from "node:assert/strict";
import test from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import { pickerEmptyState } from "../src/components/chat-model-selector-labels.ts";

/**
 * HOU-979 / HOU-976 — the chat picker's empty state, and who may act on it.
 *
 * HOU-976 removed the ask-your-admin ending entirely. A team space has no shared
 * AI account for an admin to connect on anyone's behalf: every agent runs on the
 * AI account of whoever messages it, so the member staring at an empty picker is
 * always the person who can fix it. There is no role that changes the story.
 *
 * The bug these still pin (HOU-979): the decision read capabilities that had not
 * arrived yet, and the underlying role check answers TRUE for absent capabilities
 * (the single-player default) — so the surface promised a Connect action before
 * it knew a hub existed at all. A promise made and withdrawn is worse than no
 * promise, which is why `capabilitiesLoaded` remains the gate on the ACTION.
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

test("a team space tells ONE story, whoever is looking (HOU-976)", () => {
  // Owner and plain member get the identical decision: connect YOUR account.
  // Any divergence here would be a role-shaped copy path, which is exactly the
  // ask-your-admin dead end personal-only deleted.
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
  // Mid-fetch `capabilities` is null, which the role check reads permissively —
  // so without this gate the surface promises a Connect before it knows the
  // deployment describes a hub at all. The COPY does not waver meanwhile: it
  // never depended on the viewer, so there is nothing to withdraw.
  const midFetch = pickerEmptyState({
    teamSpace: true,
    capabilities: null,
    capabilitiesLoaded: false,
  });
  assert.equal(midFetch.canConnect, false);
  assert.equal(midFetch.variant, "team");

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
  // Failed is not pending: an undescribed deployment is the single-player one.
  assert.deepEqual(
    pickerEmptyState({
      teamSpace: false,
      capabilities: null,
      capabilitiesLoaded: true,
    }),
    { variant: "personal", canConnect: true },
  );
});
