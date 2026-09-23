import assert from "node:assert/strict";
import test from "node:test";
import { buildSetupMissionPrompt } from "../src/lib/setup-mission-prompt.ts";

const BRIEF = { context: "Healthcare", role: "Operations coordinator" };

test("setup prompt uses the saved context and role instead of the agent name", () => {
  const prompt = buildSetupMissionPrompt("Jerry", "en", BRIEF);

  assert.match(prompt, /This is Jerry's very first conversation/);
  assert.match(prompt, /- Industry: Healthcare/);
  assert.match(prompt, /- Role: Operations coordinator/);
  assert.match(prompt, /every idea you offer must be specific to it/);
  assert.match(prompt, /Do not use your name to infer your role/);
});

test("the hello the user already read is quoted back, and never repeated", () => {
  assert.match(
    buildSetupMissionPrompt("Jerry", "en", BRIEF),
    /"Hi, I'm Jerry, your Operations coordinator\. Give me a few seconds to get going\. The most important thing we'll do together is create Skills, so you start automating your work\."/,
  );
  assert.match(
    buildSetupMissionPrompt("Jerry", "en"),
    /"Hi, I'm Jerry\. Give me a few seconds to get going\. The most important thing we'll do together is create Skills, so you start automating your work\."/,
  );
  for (const prompt of [
    buildSetupMissionPrompt("Jerry", "en", BRIEF),
    buildSetupMissionPrompt("Jerry", "en"),
  ]) {
    assert.match(prompt, /The user has ALREADY seen this exact message/);
    assert.match(
      prompt,
      /Do NOT greet the user, do NOT introduce yourself, and do NOT say any of that again/,
    );
    assert.match(prompt, /Your first reply continues straight on from it/);
    assert.doesNotMatch(prompt, /Open with EXACTLY this sentence/);
  }
});

test("the first reply IS the ask_user card, never a text-only line", () => {
  const brief = buildSetupMissionPrompt("Jerry", "en", BRIEF);
  assert.match(
    brief,
    /1\. Your very first action is a call to the `ask_user` tool\. Do not write a text reply first/,
  );
  assert.match(
    brief,
    /ONE question whose text says, in one short sentence, that you already have a few ideas of work you could take over and asks which one they want to start with/,
  );
  assert.match(
    brief,
    /3 concrete, specific jobs in Healthcare that this Operations coordinator repeats the same way every time/,
  );
  assert.match(
    buildSetupMissionPrompt("Sales Guru", "en"),
    /3 concrete, specific example missions you could run for them/,
  );
});

test("the ideas are options on a card, never a list in the reply", () => {
  for (const prompt of [
    buildSetupMissionPrompt("Jerry", "en", BRIEF),
    buildSetupMissionPrompt("Jerry", "en"),
  ]) {
    assert.match(
      prompt,
      /4 options \(each an `\{id, label\}` row, single-select\)/,
    );
    assert.match(prompt, /Never a category like "reporting" or "admin"/);
    assert.match(prompt, /short enough to read on a button/);
    assert.match(prompt, /The 4th option is labeled "Suggest other ideas"/);
    assert.match(
      prompt,
      /MUST be offered through `ask_user`, never written out as a list/,
    );
    assert.match(
      prompt,
      /If they pick "Suggest other ideas", ask again in exactly the same shape with 3 DIFFERENT jobs/,
    );
  }
});

test("nothing happens before the first reply: no self-written job description", () => {
  for (const prompt of [
    buildSetupMissionPrompt("Jerry", "en", BRIEF),
    buildSetupMissionPrompt("Jerry", "en"),
  ]) {
    assert.doesNotMatch(prompt, /write the body of your own instructions/);
    assert.match(prompt, /never do anything before your first reply/);
  }
});

test("without a brief the agent never guesses a job from its name", () => {
  const prompt = buildSetupMissionPrompt("Sales Guru", "en");
  assert.match(prompt, /Do not use your name to infer your role/);
  assert.doesNotMatch(prompt, /- Industry:/);
  assert.doesNotMatch(prompt, /- Role:/);
});

test("setup prompt does the job first, then saves it as a Skill", () => {
  for (const prompt of [
    buildSetupMissionPrompt("Jerry", "en", BRIEF),
    buildSetupMissionPrompt("Jerry", "en"),
  ]) {
    assert.match(prompt, /one real job done together, then saved as a Skill/);
    assert.match(prompt, /never save a Skill before the job is done once/);
    assert.match(
      prompt,
      /2\. Once they pick one, DO that job with them right now, for real/,
    );
    assert.match(prompt, /ask only the 2 or 3 questions you truly need/);
    assert.match(
      prompt,
      /3\. As soon as the result is right, save the way you did it as a Skill/,
    );
    assert.match(prompt, /it will keep improving as they run it on real cases/);
    assert.match(
      prompt,
      /4\. Along the way, save what they tell you the moment they say it/,
    );
    assert.match(prompt, /anything they want on a schedule becomes a Routine/);
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
