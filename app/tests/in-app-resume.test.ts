import assert from "node:assert/strict";
import { test } from "node:test";
import type { InAppStep } from "../src/components/onboarding/in-app-onboarding-flow.ts";
import {
  inAppResumeKey,
  resumeStepFor,
} from "../src/components/onboarding/in-app-resume.ts";

test("narration beats resume in place", () => {
  for (const step of [
    "welcome",
    "connectAiIntro",
    "integrationsIntro",
    "createAgentIntro",
    "agentCreated",
    "sendMissionIntro",
    "academyReveal",
  ] as const) {
    assert.equal(resumeStepFor(step), step);
  }
});

test("a sequence resumes at its re-arming beat, never inside a spot the reload disarmed", () => {
  const expect: Record<InAppStep, InAppStep> = {
    welcome: "welcome",
    connectAiIntro: "connectAiIntro",
    openAiHub: "openAiHub",
    connectAi: "openAiHub",
    aiConnected: "openAiHub",
    integrationsIntro: "integrationsIntro",
    openIntegrations: "openIntegrations",
    connectIntegration: "openIntegrations",
    integrationConnected: "openIntegrations",
    createAgentIntro: "createAgentIntro",
    createAgent: "createAgentIntro",
    createAgentDialog: "createAgentIntro",
    agentCreated: "agentCreated",
    sendMissionIntro: "sendMissionIntro",
    sendMission: "sendMissionIntro",
    missionSent: "sendMissionIntro",
    emailSending: "sendMissionIntro",
    emailSent: "sendMissionIntro",
    academyReveal: "academyReveal",
  };
  for (const [step, resumed] of Object.entries(expect)) {
    assert.equal(resumeStepFor(step), resumed, step);
  }
});

test("nothing saved, or an unknown step from an older build, starts at welcome", () => {
  assert.equal(resumeStepFor(null), "welcome");
  assert.equal(resumeStepFor(undefined), "welcome");
  assert.equal(resumeStepFor(""), "welcome");
  assert.equal(resumeStepFor("retiredStep"), "welcome");
});

test("the device key is scoped per signed-in user, with a local fallback", () => {
  assert.equal(inAppResumeKey("u-1"), "houston.onboarding.in-app-step.u-1");
  assert.equal(inAppResumeKey(null), "houston.onboarding.in-app-step.local");
  assert.notEqual(inAppResumeKey("u-1"), inAppResumeKey("u-2"));
});
