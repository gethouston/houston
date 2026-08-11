import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type InAppSignals,
  inAppOnboardingAdvance,
} from "../src/components/onboarding/in-app-onboarding-flow.ts";

const signals = (over: Partial<InAppSignals> = {}): InAppSignals => ({
  onAiHub: false,
  aiConnected: false,
  arrivedAiConnected: false,
  onIntegrations: false,
  integrationConnected: false,
  arrivedIntegrationConnected: false,
  agentCreated: false,
  missionSent: false,
  createDialogOpen: false,
  emailMode: false,
  emailSent: false,
  ...over,
});

const everythingTrue = signals({
  onAiHub: true,
  aiConnected: true,
  arrivedAiConnected: true,
  onIntegrations: true,
  integrationConnected: true,
  arrivedIntegrationConnected: true,
  agentCreated: true,
  missionSent: true,
  createDialogOpen: true,
  emailMode: true,
  emailSent: true,
});

test("narration beats hold regardless of signals — every user walks every step", () => {
  for (const step of [
    "welcome",
    "connectAiIntro",
    "aiConnected",
    "integrationsIntro",
    "integrationConnected",
    "createAgentIntro",
    "agentCreated",
    "sendMissionIntro",
    "missionSent",
    "emailSent",
  ] as const) {
    assert.deepEqual(inAppOnboardingAdvance(step, everythingTrue), {
      kind: "stay",
    });
  }
});

test("agent creation and the first task celebrate on baseline growth only", () => {
  assert.deepEqual(
    inAppOnboardingAdvance("createAgent", signals({ agentCreated: true })),
    { kind: "celebrate", step: "agentCreated" },
  );
  assert.deepEqual(inAppOnboardingAdvance("createAgent", signals()), {
    kind: "stay",
  });
  assert.deepEqual(
    inAppOnboardingAdvance("sendMission", signals({ missionSent: true })),
    { kind: "celebrate", step: "missionSent" },
  );
  assert.deepEqual(inAppOnboardingAdvance("sendMission", signals()), {
    kind: "stay",
  });
});

test("the dialog step follows the dialog: open coaches inside, closed returns", () => {
  assert.deepEqual(
    inAppOnboardingAdvance("createAgent", signals({ createDialogOpen: true })),
    { kind: "goto", step: "createAgentDialog" },
  );
  assert.deepEqual(
    inAppOnboardingAdvance(
      "createAgentDialog",
      signals({ createDialogOpen: true }),
    ),
    { kind: "stay" },
  );
  assert.deepEqual(inAppOnboardingAdvance("createAgentDialog", signals()), {
    kind: "goto",
    step: "createAgent",
  });
  // Creation wins over dialog state in both steps.
  for (const step of ["createAgent", "createAgentDialog"] as const) {
    assert.deepEqual(
      inAppOnboardingAdvance(
        step,
        signals({ createDialogOpen: true, agentCreated: true }),
      ),
      { kind: "celebrate", step: "agentCreated" },
    );
  }
});

test("the email variant holds at send and celebrates on the actual send", () => {
  assert.deepEqual(
    inAppOnboardingAdvance(
      "sendMission",
      signals({ missionSent: true, emailMode: true }),
    ),
    { kind: "goto", step: "emailSending" },
  );
  assert.deepEqual(inAppOnboardingAdvance("emailSending", signals()), {
    kind: "stay",
  });
  assert.deepEqual(
    inAppOnboardingAdvance("emailSending", signals({ emailSent: true })),
    { kind: "celebrate", step: "emailSent" },
  );
});

test("the AI sidebar spot advances when the hub opens, connected or not", () => {
  for (const aiConnected of [false, true]) {
    assert.deepEqual(
      inAppOnboardingAdvance(
        "openAiHub",
        signals({ onAiHub: true, aiConnected }),
      ),
      { kind: "goto", step: "connectAi" },
    );
  }
  assert.deepEqual(inAppOnboardingAdvance("openAiHub", signals()), {
    kind: "stay",
  });
});

test("an AI connection made DURING the connect step celebrates", () => {
  assert.deepEqual(
    inAppOnboardingAdvance("connectAi", signals({ aiConnected: true })),
    { kind: "celebrate", step: "aiConnected" },
  );
  assert.deepEqual(inAppOnboardingAdvance("connectAi", signals()), {
    kind: "stay",
  });
});

test("an arrival ALREADY connected holds for the addendum (AI and apps)", () => {
  assert.deepEqual(
    inAppOnboardingAdvance(
      "connectAi",
      signals({ aiConnected: true, arrivedAiConnected: true }),
    ),
    { kind: "stay" },
  );
  assert.deepEqual(
    inAppOnboardingAdvance(
      "connectIntegration",
      signals({
        integrationConnected: true,
        arrivedIntegrationConnected: true,
      }),
    ),
    { kind: "stay" },
  );
});

test("the Integrations sidebar spot advances when the view opens", () => {
  assert.deepEqual(
    inAppOnboardingAdvance(
      "openIntegrations",
      signals({ onIntegrations: true }),
    ),
    { kind: "goto", step: "connectIntegration" },
  );
  assert.deepEqual(inAppOnboardingAdvance("openIntegrations", signals()), {
    kind: "stay",
  });
});

test("an integration connected DURING its step celebrates", () => {
  assert.deepEqual(
    inAppOnboardingAdvance(
      "connectIntegration",
      signals({ integrationConnected: true }),
    ),
    { kind: "celebrate", step: "integrationConnected" },
  );
  assert.deepEqual(inAppOnboardingAdvance("connectIntegration", signals()), {
    kind: "stay",
  });
});
