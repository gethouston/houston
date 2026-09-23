import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_SETUP_AGENT_MODE } from "../src/lib/agent-setup-mode.ts";
import {
  deriveSetupHello,
  setupInstructionsTarget,
} from "../src/lib/setup-hello.ts";
import type { SetupGreetingEntry } from "../src/lib/setup-mission-greeting.ts";

const ENTRY: SetupGreetingEntry = {
  agentPath: "/w/Nova",
  sessionKey: "activity-x",
  agentName: "Nova",
  role: "Financial analyst",
  registeredAt: 1_000,
};

const JOB_DESCRIPTION =
  "---\nindustry: Finance\nrole: Financial analyst\n---\n";

describe("setupInstructionsTarget", () => {
  it("reads the job description while the record is still fresh", () => {
    strictEqual(
      setupInstructionsTarget({
        agentPath: "/w/Nova",
        entry: ENTRY,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
      }),
      "/w/Nova",
    );
  });

  it("reads it once the record is gone, on the activity's own marker", () => {
    strictEqual(
      setupInstructionsTarget({
        agentPath: "/w/Nova",
        entry: null,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
      }),
      "/w/Nova",
    );
  });

  it("reads nothing for any other chat, or with no agent", () => {
    strictEqual(
      setupInstructionsTarget({
        agentPath: "/w/Nova",
        entry: null,
        activityAgentMode: null,
      }),
      undefined,
    );
    strictEqual(
      setupInstructionsTarget({
        agentPath: null,
        entry: ENTRY,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
      }),
      undefined,
    );
  });
});

describe("deriveSetupHello", () => {
  it("names the agent and the job from the creation record", () => {
    deepStrictEqual(
      deriveSetupHello({
        entry: ENTRY,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
        agentName: "Nova",
        instructions: undefined,
        instructionsFetched: false,
      }),
      {
        isSetupMission: true,
        hello: { name: "Nova", role: "Financial analyst" },
      },
    );
  });

  it("hands over to the job description with the SAME sentence at the TTL", () => {
    // The record expires with the chat open. Its read was enabled all along
    // (`setupInstructionsTarget`), so the hello never blinks out.
    const before = deriveSetupHello({
      entry: ENTRY,
      activityAgentMode: AGENT_SETUP_AGENT_MODE,
      agentName: "Nova",
      instructions: JOB_DESCRIPTION,
      instructionsFetched: true,
    });
    const after = deriveSetupHello({
      entry: null,
      activityAgentMode: AGENT_SETUP_AGENT_MODE,
      agentName: "Nova",
      instructions: JOB_DESCRIPTION,
      instructionsFetched: true,
    });
    deepStrictEqual(after, before);
    deepStrictEqual(after.hello, { name: "Nova", role: "Financial analyst" });
  });

  it("holds the hello back until the job description has been read", () => {
    strictEqual(
      deriveSetupHello({
        entry: null,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
        agentName: "Nova",
        instructions: undefined,
        instructionsFetched: false,
      }).hello,
      null,
    );
  });

  it("treats an EMPTY job description as unread, record or no record", () => {
    // A just-created hosted agent's file read answers `""` while its pod is
    // still being provisioned (`lib/tauri.ts` isAgentPathCreating), and a read
    // that failed is swallowed into `""` by the same hook — so a fetched-but-
    // empty description says nothing about the job. Latching on it dropped the
    // role clause the moment the creation record expired.
    strictEqual(
      deriveSetupHello({
        entry: null,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
        agentName: "Nova",
        instructions: "",
        instructionsFetched: true,
      }).hello,
      null,
    );
    deepStrictEqual(
      deriveSetupHello({
        entry: ENTRY,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
        agentName: "Nova",
        instructions: "",
        instructionsFetched: true,
      }).hello,
      { name: "Nova", role: "Financial analyst" },
    );
  });

  it("holds it back while the agent has no name to say", () => {
    strictEqual(
      deriveSetupHello({
        entry: null,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
        agentName: undefined,
        instructions: JOB_DESCRIPTION,
        instructionsFetched: true,
      }).hello,
      null,
    );
  });

  it("names the agent alone when it was hired for no job", () => {
    deepStrictEqual(
      deriveSetupHello({
        entry: { ...ENTRY, role: null },
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
        agentName: "Nova",
        instructions: undefined,
        instructionsFetched: false,
      }).hello,
      { name: "Nova", role: null },
    );
    deepStrictEqual(
      deriveSetupHello({
        entry: null,
        activityAgentMode: AGENT_SETUP_AGENT_MODE,
        agentName: "Nova",
        instructions: "---\nindustry: Finance\n---\n",
        instructionsFetched: true,
      }).hello,
      { name: "Nova", role: null },
    );
  });

  it("answers no hello at all for any other chat", () => {
    deepStrictEqual(
      deriveSetupHello({
        entry: null,
        activityAgentMode: "houston:routine-setup",
        agentName: "Nova",
        instructions: JOB_DESCRIPTION,
        instructionsFetched: true,
      }),
      { isSetupMission: false, hello: null },
    );
  });
});
