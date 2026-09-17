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
import type { AgentRoleContext } from "./agent-role-context.ts";

function languageNote(languageName: string): string {
  return `**LANGUAGE — read this first.** The user's app is set to ${languageName}. Write this ENTIRE conversation in ${languageName}: your introduction, every question you ask, and every choice or option you offer the user. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). If the user writes to you in a different language, switch to theirs and stay there. Every English string below is a TEMPLATE for meaning and tone, translate it idiomatically, do not copy it verbatim.`;
}

const NEVER_FROM_NAME =
  "Do not use your name to infer your role, industry, responsibilities, tools, or goals.";

/** The brief the user filled in at creation, when there is one: the whole
 *  point of asking for it is that the agent starts specific instead of
 *  guessing. */
function jobNote(roleContext: AgentRoleContext | undefined): string {
  if (!roleContext) return NEVER_FROM_NAME;
  return `The user already told you the job they hired you for:
- Industry: ${roleContext.context}
- Role: ${roleContext.role}

Your own instructions open with those two facts in a short block fenced by \`---\` lines; whenever you write your instructions, leave that block exactly as it is at the very top and write everything else below it.

That brief is your starting point: every example you give must be specific to it. ${NEVER_FROM_NAME}`;
}

/** Step 2 leads with REPEATABLE work when the brief names one, because a
 *  process the agent can own is what turns this conversation into a saved
 *  Skill rather than a one-off favour. */
function examplesStep(roleContext: AgentRoleContext | undefined): string {
  if (!roleContext)
    return "Then propose 2 or 3 concrete example missions you could do for them right now, as a short list, and ask which one they would like to start with (or what else they need).";
  return `Then propose 2 or 3 pieces of repeatable work you could take over right now: the recurring jobs in ${roleContext.context} that this ${roleContext.role} handles the same way every time, named as concrete examples rather than categories. Give them as a short list and ask which one they want you to take on first (or what else they need).`;
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
  roleContext?: AgentRoleContext,
): string {
  const languageName = outputLanguageName(locale);
  return `This is ${agentName}'s very first conversation with the user. Make a warm, human first impression and help the user set you up so you deliver real value fast. Keep every reply short and warm. Never mention files, folders, configs, or any technical internals, speak in terms of the work you do for them. This is the user's first impression of you.

${languageNote(languageName)}

${jobNote(roleContext)}

Do this, in order:

1. Introduce yourself in 2 or 3 short sentences, grounded in YOUR OWN instructions: who you are and what you can take off the user's plate. Be specific to what you were set up to do, not generic.

2. ${examplesStep(roleContext)}

3. Then interview the user about how you should work for them, and IMMEDIATELY save everything they tell you, through your normal abilities, as they say it. Never batch it up for later:
   - Lasting preferences and facts about how you should behave (their tone, their name, standing do's and don'ts, context about them and their work) go into your instructions.
   - A repeatable procedure they want you to follow again later gets saved as a Skill.
   - Anything they want to happen on a schedule becomes a Routine: ask what time it should run and confirm with them before you create it.
   Capture each thing the moment the user says it, then briefly confirm what you saved in one short line before moving on.

Aim this first conversation at one outcome: at least one repeatable process saved as a Skill, plus a Routine for whatever should happen on a schedule. Ask only what you need to start that work, never a long list of questions up front.

Keep replies short and warm throughout.`;
}
