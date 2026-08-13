import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type InAppSignals,
  type InAppStep,
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
    "academyReveal",
  ] as const) {
    assert.deepEqual(inAppOnboardingAdvance(step, everythingTrue), {
      kind: "stay",
    });
  }
});

test("the Academy reveal is the flow's last word, whatever the signals say", () => {
  // The closing beat is button-advanced like every other card, and no signal
  // can move it: the run ends by the user's own action on the reveal.
  for (const over of [
    {},
    { missionSent: true },
    { emailMode: true, emailSent: true },
  ]) {
    assert.deepEqual(
      inAppOnboardingAdvance("academyReveal", signals(over)),
      { kind: "stay" },
      JSON.stringify(over),
    );
  }
});

test("no signal jumps the user into the reveal — its finales hand off by button", () => {
  // The finales are read beats: the run reaches the reveal through their CTA
  // (`startAcademyReveal`), never behind the user's back on a live signal.
  const steps: InAppStep[] = [
    "welcome",
    "connectAiIntro",
    "openAiHub",
    "connectAi",
    "aiConnected",
    "integrationsIntro",
    "openIntegrations",
    "connectIntegration",
    "createAgentIntro",
    "createAgent",
    "createAgentDialog",
    "agentCreated",
    "sendMissionIntro",
    "sendMission",
    "missionSent",
    "emailSending",
    "emailSent",
    "academyReveal",
  ];
  for (const step of steps) {
    for (const s of [signals(), everythingTrue]) {
      const advance = inAppOnboardingAdvance(step, s);
      assert.notEqual(
        advance.kind === "stay" ? null : advance.step,
        "academyReveal",
        step,
      );
    }
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

test("emailSending falls back to the sent finale if email mode drops", () => {
  // Priming failed after the send: emailMode false, no marker will come.
  assert.deepEqual(
    inAppOnboardingAdvance("emailSending", signals({ emailMode: false })),
    { kind: "celebrate", step: "missionSent" },
  );
  // Still armed and no marker yet: keep watching.
  assert.deepEqual(
    inAppOnboardingAdvance("emailSending", signals({ emailMode: true })),
    { kind: "stay" },
  );
});

test("the email variant holds at send and celebrates on the actual send", () => {
  assert.deepEqual(
    inAppOnboardingAdvance(
      "sendMission",
      signals({ missionSent: true, emailMode: true }),
    ),
    { kind: "goto", step: "emailSending" },
  );
  assert.deepEqual(
    inAppOnboardingAdvance("emailSending", signals({ emailMode: true })),
    { kind: "stay" },
  );
  assert.deepEqual(
    inAppOnboardingAdvance(
      "emailSending",
      signals({ emailMode: true, emailSent: true }),
    ),
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
