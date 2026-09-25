import assert from "node:assert/strict";
import { test } from "vitest";
import { englishSetupGreeting } from "./first-day-greeting";
import { buildFirstDayPrompt, outputLanguageName } from "./first-day-prompt";

const BRIEF = { context: "Healthcare", role: "Operations coordinator" };

test("setup prompt uses the saved context and role instead of the agent name", () => {
  const prompt = buildFirstDayPrompt("Jerry", "en", BRIEF);

  assert.match(prompt, /This is Jerry's very first conversation/);
  assert.match(prompt, /- Industry: Healthcare/);
  assert.match(prompt, /- Role: Operations coordinator/);
  assert.match(prompt, /every idea you offer must be specific to it/);
  assert.match(prompt, /Do not use your name to infer your role/);
});

test("the hello the user already read is quoted back, and never repeated", () => {
  const roled = buildFirstDayPrompt("Jerry", "en", BRIEF);
  assert.ok(
    roled.includes(
      `"Hi, I'm **Jerry**, your operations coordinator! Today is my *first day*, so help me learn how I can be most useful to you.\n\nTogether we'll write down how I do my everyday work.`,
    ),
  );
  assert.ok(
    buildFirstDayPrompt("Jerry", "en").includes(
      `"Hi, I'm **Jerry**! Today is my *first day*,`,
    ),
  );
  assert.ok(
    buildFirstDayPrompt("Operations Coordinator", "en", BRIEF).includes(
      `"Hi, I'm your **operations coordinator**! Today is my *first day*,`,
    ),
  );
  assert.ok(roled.includes(`Here are a few tasks we could start with:"`));
  for (const prompt of [roled, buildFirstDayPrompt("Jerry", "en")]) {
    assert.match(prompt, /The user has ALREADY seen this exact message/);
    assert.match(
      prompt,
      /Do NOT greet the user, do NOT introduce yourself, and do NOT say any of that again/,
    );
    assert.match(prompt, /Your first reply continues straight on from it/);
    assert.doesNotMatch(prompt, /Open with EXACTLY this sentence/);
  }
});

/**
 * The prompt quotes the hello back to the model so it can see there is nothing
 * left to introduce, and that quote has to be the message the chat ACTUALLY
 * renders: `englishSetupGreeting`, which the app pins to its en
 * `chat:setupGreeting.*` copy word for word.
 */
test("the quoted hello is the English greeting, word for word", () => {
  const cases: Array<[string, typeof BRIEF | undefined]> = [
    ["Jerry", BRIEF],
    ["Jerry", undefined],
    ["operations coordinator", BRIEF],
  ];
  for (const [name, brief] of cases) {
    const hello = englishSetupGreeting(name, brief?.role ?? null);
    assert.ok(
      buildFirstDayPrompt(name, "en", brief).includes(`"${hello}"`),
      `the prompt no longer quotes the hello for ${name}`,
    );
  }
});

test("the first reply IS the ask_user card, never a text-only line", () => {
  const brief = buildFirstDayPrompt("Jerry", "en", BRIEF);
  assert.match(
    brief,
    /1\. Your very first action is a call to the `ask_user` tool\. Do not write a text reply first/,
  );
  assert.match(
    brief,
    /the card follows it directly: give it ONE question whose text is a short follow-on to that line, like "Which one should we start with\?", never announcing again that you have ideas/,
  );
  assert.match(
    brief,
    /3 concrete, specific jobs in Healthcare that this Operations coordinator repeats the same way every time/,
  );
  assert.match(
    buildFirstDayPrompt("Sales Guru", "en"),
    /3 concrete, specific example missions you could run for them/,
  );
});

test("the ideas are options on a card, never a list in the reply", () => {
  for (const prompt of [
    buildFirstDayPrompt("Jerry", "en", BRIEF),
    buildFirstDayPrompt("Jerry", "en"),
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
    buildFirstDayPrompt("Jerry", "en", BRIEF),
    buildFirstDayPrompt("Jerry", "en"),
  ]) {
    assert.doesNotMatch(prompt, /write the body of your own instructions/);
    assert.match(prompt, /never do anything before your first reply/);
  }
});

test("without a brief the agent never guesses a job from its name", () => {
  const prompt = buildFirstDayPrompt("Sales Guru", "en");
  assert.match(prompt, /Do not use your name to infer your role/);
  assert.doesNotMatch(prompt, /- Industry:/);
  assert.doesNotMatch(prompt, /- Role:/);
});

test("setup prompt does the job first, then saves it as a Skill", () => {
  for (const prompt of [
    buildFirstDayPrompt("Jerry", "en", BRIEF),
    buildFirstDayPrompt("Jerry", "en"),
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
    buildFirstDayPrompt("Jerry", "es", {
      context: "Legal",
      role: "Paralegal",
    }),
    /The user's app is set to Spanish/,
  );
  assert.match(
    buildFirstDayPrompt("Jerry", "pt"),
    /The user's app is set to Portuguese/,
  );
});

test("outputLanguageName maps locale codes (with region) to language names", () => {
  assert.equal(outputLanguageName("en"), "English");
  assert.equal(outputLanguageName("es"), "Spanish");
  assert.equal(outputLanguageName("es-419"), "Spanish");
  assert.equal(outputLanguageName("pt-BR"), "Portuguese");
});

test("outputLanguageName falls back to English for unmapped locales", () => {
  assert.equal(outputLanguageName("zz"), "English");
});
