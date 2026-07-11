import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersonalAssistantSeeds,
  outputLanguageName,
} from "./personal-assistant-seeds.ts";

// The seed builder takes a translator for the SHORT UI bits (name/title/desc);
// a key-echo stub is enough — we assert on structure + the English-only prompt.
const t = (key) => key;

const ROUTINES_KEY = ".houston/routines/routines.json";
const SKILL_KEY = ".agents/skills/meeting-prep/SKILL.md";

function routineOf(locale) {
  const seeds = buildPersonalAssistantSeeds(t, locale);
  const routines = JSON.parse(seeds[ROUTINES_KEY]);
  assert.equal(routines.length, 1);
  return routines[0];
}

test("outputLanguageName maps locale codes (with region) to language names", () => {
  assert.equal(outputLanguageName("en"), "English");
  assert.equal(outputLanguageName("es"), "Spanish");
  assert.equal(outputLanguageName("pt-BR"), "Portuguese");
  assert.equal(outputLanguageName("zz"), "English"); // unmapped falls back
});

test("daily-briefing seed is suppress_when_silent with no dead description", () => {
  const routine = routineOf("en");
  assert.equal(routine.id, "daily-briefing");
  assert.equal(routine.suppress_when_silent, true);
  // HOU-725 strips `description` on read and the schema forbids it — it must not
  // be seeded in the first place.
  assert.equal("description" in routine, false);
  assert.equal(routine.schedule, "0 7 * * 1-5");
});

test("daily-briefing prompt writes output in the user's language (es)", () => {
  const es = routineOf("es").prompt;
  assert.match(es, /in Spanish/);
  assert.doesNotMatch(es, /in English/);

  const en = routineOf("en").prompt;
  assert.match(en, /in English/);
});

test("daily-briefing prompt goes silent (ROUTINE_OK) when nothing is connected", () => {
  const prompt = routineOf("en").prompt;
  assert.match(prompt, /NEITHER a calendar NOR an inbox is connected/);
  assert.match(prompt, /ROUTINE_OK/);
  // It must never open by apologizing for what it could not reach.
  assert.match(prompt, /never turn this into an apology/);
});

test("meeting-prep skill hands its final brief in the user's language (pt)", () => {
  const skill = buildPersonalAssistantSeeds(t, "pt")[SKILL_KEY];
  assert.match(skill, /Write the brief in Portuguese/);
  assert.match(skill, /name: meeting-prep/);
});
