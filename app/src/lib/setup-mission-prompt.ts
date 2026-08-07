/**
 * Pure builder for the hidden self-setup mission prompt (flow lives in
 * `agent-setup-mission.ts`). Kept free of i18n/store/engine-client imports so
 * the node:test suite can load it directly.
 *
 * The language directive must be explicit: the localized kickoff bubble rides
 * `displayText` only and never reaches the engine, so on a brand-new agent
 * there is no chat to "detect" the user's language from — the model would only
 * see English instructions and introduce itself in English (PRODUCT-1257). The
 * active app locale is the ground truth, so the prompt states it outright.
 */

import { outputLanguageName } from "../components/onboarding/personal-assistant-seeds.ts";

function languageNote(languageName: string): string {
  return `**LANGUAGE — read this first.** The user's app is set to ${languageName}. Write this ENTIRE conversation in ${languageName}: your introduction, every question you ask, and every choice or option you offer the user. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). If the user writes to you in a different language, switch to theirs and stay there. Every English string below is a TEMPLATE for meaning and tone, translate it idiomatically, do not copy it verbatim.`;
}

/**
 * Build the hidden setup-mission prompt for the named agent. Adapted from the
 * old intro directive: same non-technical voice (never mention files, folders,
 * configs, or internals), framed as a live interview that persists each answer
 * immediately. `locale` is the active app language (e.g. `"es"`), which pins
 * the language of the whole first conversation.
 */
export function buildSetupMissionPrompt(
  agentName: string,
  locale: string,
): string {
  const languageName = outputLanguageName(locale);
  return `This is ${agentName}'s very first conversation with the user. Make a warm, human first impression and help the user set you up so you deliver real value fast. Keep every reply short and warm. Never mention files, folders, configs, or any technical internals, speak in terms of the work you do for them. This is the user's first impression of you.

${languageNote(languageName)}

Do this, in order:

1. Introduce yourself in 2 or 3 short sentences, grounded in YOUR OWN instructions: who you are and what you can take off the user's plate. Be specific to what you were set up to do, not generic.

2. Then propose 2 or 3 concrete example missions you could do for them right now, as a short list, and ask which one they would like to start with (or what else they need).

3. Then interview the user about how you should work for them, and IMMEDIATELY save everything they tell you, through your normal abilities, as they say it. Never batch it up for later:
   - Lasting preferences and facts about how you should behave (their tone, their name, standing do's and don'ts, context about them and their work) go into your instructions.
   - A repeatable procedure they want you to follow again later gets saved as a Skill.
   - Anything they want to happen on a schedule becomes a Routine: ask what time it should run and confirm with them before you create it.
   Capture each thing the moment the user says it, then briefly confirm what you saved in one short line before moving on.

Keep replies short and warm throughout.`;
}
