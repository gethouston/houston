import assert from "node:assert/strict";
import test from "node:test";
import { buildSetupMissionPrompt } from "../src/lib/setup-mission-prompt.ts";

test("setup prompt uses the saved context and role instead of the agent name", () => {
  const prompt = buildSetupMissionPrompt("Jerry", "en", {
    context: "Healthcare",
    role: "Operations coordinator",
  });

  assert.match(prompt, /This is Jerry's very first conversation/);
  assert.match(prompt, /- Industry: Healthcare/);
  assert.match(prompt, /- Role: Operations coordinator/);
  assert.match(prompt, /every example you give must be specific to it/);
  assert.match(prompt, /Do not use your name to infer your role/);
});

test("the brief tells the agent to keep the block at the top of its instructions", () => {
  const prompt = buildSetupMissionPrompt("Jerry", "en", {
    context: "Healthcare",
    role: "Operations coordinator",
  });
  assert.match(
    prompt,
    /leave that block exactly as it is at the very top and write everything else below it/,
  );
  // An agent created without a brief has no block, so it is never told about one.
  assert.doesNotMatch(buildSetupMissionPrompt("Jerry", "en"), /that block/);
});

test("with a brief, the examples step leads with repeatable work for that job", () => {
  const prompt = buildSetupMissionPrompt("Jerry", "en", {
    context: "Healthcare",
    role: "Operations coordinator",
  });

  assert.match(
    prompt,
    /2\. Then propose 2 or 3 pieces of repeatable work you could take over right now/,
  );
  assert.match(
    prompt,
    /recurring jobs in Healthcare that this Operations coordinator handles the same way every time/,
  );
});

test("setup prompt aims the first conversation at Skills and Routines", () => {
  for (const prompt of [
    buildSetupMissionPrompt("Jerry", "en", {
      context: "Healthcare",
      role: "Operations coordinator",
    }),
    buildSetupMissionPrompt("Jerry", "en"),
  ]) {
    assert.match(prompt, /at least one repeatable process saved as a Skill/);
    assert.match(prompt, /a Routine for whatever should happen on a schedule/);
    assert.match(prompt, /Ask only what you need to start that work/);
  }
});

test("setup prompt keeps the language directive in both shapes", () => {
  assert.match(
    buildSetupMissionPrompt("Jerry", "es", {
      context: "Legal",
      role: "Paralegal",
    }),
    /The user's app is set to Spanish/,
  );
  assert.match(
    buildSetupMissionPrompt("Jerry", "pt"),
    /The user's app is set to Portuguese/,
  );
});

test("setup prompt still forbids name-derived setup without role context", () => {
  const prompt = buildSetupMissionPrompt("Sales Guru", "en");

  assert.match(prompt, /This is Sales Guru's very first conversation/);
  assert.match(prompt, /Do not use your name to infer your role/);
  assert.doesNotMatch(prompt, /- Industry:/);
  assert.doesNotMatch(prompt, /- Role:/);
  assert.match(
    prompt,
    /2\. Then propose 2 or 3 concrete example missions you could do for them right now/,
  );
});
