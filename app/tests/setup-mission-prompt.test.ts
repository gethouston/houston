import { doesNotMatch, match, ok } from "node:assert";
import { describe, it } from "node:test";
import { buildSetupMissionPrompt } from "../src/lib/setup-mission-prompt.ts";

// PRODUCT-1257: the engine never sees the localized kickoff bubble, so the
// prompt must pin the conversation language from the app locale explicitly —
// "detect it from the chat" has nothing to detect on a brand-new agent.
describe("buildSetupMissionPrompt", () => {
  it("pins Spanish for an es locale", () => {
    const prompt = buildSetupMissionPrompt("Jarvis", "es");
    match(prompt, /The user's app is set to Spanish/);
    match(prompt, /Write this ENTIRE conversation in Spanish/);
  });

  it("pins Portuguese for a regioned pt-BR locale", () => {
    const prompt = buildSetupMissionPrompt("Jarvis", "pt-BR");
    match(prompt, /The user's app is set to Portuguese/);
  });

  it("pins English for en and falls back to English for unknown locales", () => {
    match(buildSetupMissionPrompt("Jarvis", "en"), /set to English/);
    match(buildSetupMissionPrompt("Jarvis", "fr"), /set to English/);
  });

  it("no longer asks the model to detect the language from the chat", () => {
    doesNotMatch(
      buildSetupMissionPrompt("Jarvis", "es"),
      /[Dd]etect the user's language/,
    );
  });

  it("keeps the agent name and the interview structure", () => {
    const prompt = buildSetupMissionPrompt("Jarvis", "es");
    ok(prompt.startsWith("This is Jarvis's very first conversation"));
    match(prompt, /saved as a Skill/);
    match(prompt, /becomes a Routine/);
  });
});
