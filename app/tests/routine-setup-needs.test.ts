import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pendingRoutineSetup,
  routineConnectNeed,
} from "../src/lib/routine-setup-needs.ts";
import { buildSetupMissionPrompt } from "../src/lib/setup-mission-prompt.ts";

const gmail = { kind: "composio" as const, toolkit: "gmail" };
const upper = (s: string) => s[0]?.toUpperCase() + s.slice(1);

describe("routineConnectNeed", () => {
  it("names the toolkit when the account has not connected it", () => {
    assert.equal(routineConnectNeed(gmail, ["slack"]), "gmail");
  });

  it("is quiet when the app is connected", () => {
    assert.equal(routineConnectNeed(gmail, ["gmail", "slack"]), null);
  });

  it("never accuses while the connections are unknown", () => {
    assert.equal(routineConnectNeed(gmail, null), null);
  });

  it("treats a binding with no kind as Composio (the pre-webhook shape)", () => {
    assert.equal(routineConnectNeed({ toolkit: "gmail" }, []), "gmail");
  });

  it("says nothing about a webhook wake or a clock", () => {
    assert.equal(routineConnectNeed({ kind: "webhook" }, []), null);
    assert.equal(routineConnectNeed(undefined, []), null);
  });
});

describe("pendingRoutineSetup", () => {
  const routines = [
    { name: "Morning digest" },
    { name: "New mail summary", trigger: gmail },
    {
      name: "Slack watch",
      trigger: { kind: "composio" as const, toolkit: "slack" },
    },
    { name: "External ping", trigger: { kind: "webhook" as const } },
  ];

  it("lists only what the person still has to do, with real app names", () => {
    assert.deepEqual(pendingRoutineSetup(routines, ["slack"], upper), [
      {
        routineName: "New mail summary",
        kind: "connect_app",
        appName: "Gmail",
      },
      { routineName: "External ping", kind: "webhook_address" },
    ]);
  });

  it("reports nothing to connect when every app is already connected", () => {
    assert.deepEqual(
      pendingRoutineSetup(routines, ["gmail", "slack"], upper).map(
        (n) => n.kind,
      ),
      ["webhook_address"],
    );
  });
});

describe("buildSetupMissionPrompt", () => {
  it("omits the pending block when nothing needs the person", () => {
    const prompt = buildSetupMissionPrompt("Mailer", "en");
    assert.ok(!prompt.includes("cannot run yet"));
  });

  it("asks the agent to raise each pending automation by name", () => {
    const prompt = buildSetupMissionPrompt("Mailer", "en", [
      {
        routineName: "New mail summary",
        kind: "connect_app",
        appName: "Gmail",
      },
      { routineName: "External ping", kind: "webhook_address" },
    ]);
    assert.ok(prompt.includes('"New mail summary"'));
    assert.ok(prompt.includes("Gmail"));
    assert.ok(prompt.includes('"External ping"'));
    // The product voice: never a slug, never an error.
    assert.ok(!prompt.includes("gmail"));
    assert.ok(prompt.includes("never as an error"));
  });
});
