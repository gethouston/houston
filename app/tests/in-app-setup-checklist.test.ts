import assert from "node:assert/strict";
import { test } from "node:test";
import { inAppSetupChecklist } from "../src/components/onboarding/in-app-setup-checklist.ts";

const ALL = { integrationsOn: true, canCreateAgents: true };

const states = (step: Parameters<typeof inAppSetupChecklist>[0]) =>
  inAppSetupChecklist(step, ALL).map((i) => `${i.id}:${i.state}`);

test("the welcome shows the whole setup ahead, first item current", () => {
  assert.deepEqual(states("welcome"), [
    "ai:current",
    "apps:todo",
    "agent:todo",
    "task:todo",
  ]);
});

test("each celebration checks its item and points at the next", () => {
  assert.deepEqual(states("aiConnected"), [
    "ai:done",
    "apps:current",
    "agent:todo",
    "task:todo",
  ]);
  assert.deepEqual(states("integrationConnected"), [
    "ai:done",
    "apps:done",
    "agent:current",
    "task:todo",
  ]);
  assert.deepEqual(states("agentCreated"), [
    "ai:done",
    "apps:done",
    "agent:done",
    "task:current",
  ]);
});

test("the finales and the Academy reveal show everything done", () => {
  for (const step of ["missionSent", "emailSent", "academyReveal"] as const) {
    assert.ok(
      inAppSetupChecklist(step, ALL).every((i) => i.state === "done"),
      step,
    );
  }
});

test("gated items vanish instead of dangling", () => {
  assert.deepEqual(
    inAppSetupChecklist("welcome", {
      integrationsOn: false,
      canCreateAgents: true,
    }).map((i) => i.id),
    ["ai", "agent", "task"],
  );
  assert.deepEqual(
    inAppSetupChecklist("aiConnected", {
      integrationsOn: false,
      canCreateAgents: false,
    }).map((i) => `${i.id}:${i.state}`),
    ["ai:done"],
  );
});

test("mid-sequence spot steps keep their item current, not done", () => {
  assert.deepEqual(states("connectAi")[0], "ai:current");
  assert.deepEqual(states("openIntegrations")[1], "apps:current");
  assert.deepEqual(states("createAgentDialog")[2], "agent:current");
  assert.deepEqual(states("emailSending")[3], "task:current");
});
