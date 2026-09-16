/**
 * Pure builder for the hidden self-setup mission prompt (flow lives in
 * `agent-setup-mission.ts`). Kept free of i18n/store/engine-adapter imports so
 * the node:test suite can load it directly.
 *
 * The language directive must be explicit: the localized kickoff bubble rides
 * `displayText` only and never reaches the engine, so on a brand-new agent
 * there is no chat to "detect" the user's language from — the model would only
 * see English instructions and introduce itself in English (PRODUCT-1257). The
 * active app locale is the ground truth, so the prompt states it outright.
 */

import { outputLanguageName } from "../components/onboarding/personal-assistant-seeds.ts";
import type { RoutineSetupNeed } from "./routine-setup-needs.ts";

function languageNote(languageName: string): string {
  return `**LANGUAGE — read this first.** The user's app is set to ${languageName}. Write this ENTIRE conversation in ${languageName}: your introduction, every question you ask, and every choice or option you offer the user. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). If the user writes to you in a different language, switch to theirs and stay there. Every English string below is a TEMPLATE for meaning and tone, translate it idiomatically, do not copy it verbatim.`;
}

/**
 * The paragraph that tells an imported agent which of its automations the person
 * still has to switch on. An installed listing brings routines whose wake needs
 * an account the installer has not connected, or a webhook address nobody has
 * minted yet — the agent is the one talking to them, so it is the one that has
 * to say so, in their language, without naming a slug or a screen.
 */
function pendingSetupNote(needs: RoutineSetupNeed[]): string {
  const lines = needs.map((need) =>
    need.kind === "connect_app"
      ? `   - "${need.routineName}" wakes on activity in ${need.appName}, so the user has to connect that app before it can run.`
      : `   - "${need.routineName}" wakes when an outside system calls it, so the user has to create its web address before it can run.`,
  );
  return `4. You arrived with automations that cannot run yet. Tell the user plainly, in one short line each, what is still needed, and offer to walk them through it:
${lines.join("\n")}
   Say it as something YOU need from them to start working, never as an error.`;
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
  pendingSetup: RoutineSetupNeed[] = [],
): string {
  const languageName = outputLanguageName(locale);
  const pending = pendingSetup.length
    ? `\n\n${pendingSetupNote(pendingSetup)}`
    : "";
  return `This is ${agentName}'s very first conversation with the user. Make a warm, human first impression and help the user set you up so you deliver real value fast. Keep every reply short and warm. Never mention files, folders, configs, or any technical internals, speak in terms of the work you do for them. This is the user's first impression of you.

${languageNote(languageName)}

Do this, in order:

1. Introduce yourself in 2 or 3 short sentences, grounded in YOUR OWN instructions: who you are and what you can take off the user's plate. Be specific to what you were set up to do, not generic.

2. Then propose 2 or 3 concrete example missions you could do for them right now, as a short list, and ask which one they would like to start with (or what else they need).

3. Then interview the user about how you should work for them, and IMMEDIATELY save everything they tell you, through your normal abilities, as they say it. Never batch it up for later:
   - Lasting preferences and facts about how you should behave (their tone, their name, standing do's and don'ts, context about them and their work) go into your instructions.
   - A repeatable procedure they want you to follow again later gets saved as a Skill.
   - Anything they want to happen on a schedule becomes a Routine: ask what time it should run and confirm with them before you create it.
   Capture each thing the moment the user says it, then briefly confirm what you saved in one short line before moving on.${pending}

Keep replies short and warm throughout.`;
}
