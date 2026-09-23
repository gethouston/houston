/**
 * Pure builder for the hidden self-setup mission prompt (flow lives in
 * `agent-setup-mission.ts`). Kept free of i18n/store/engine-adapter imports so
 * the node:test suite can load it directly.
 *
 * The language directive must be explicit: the whole first message is hidden
 * from the transcript, so on a brand-new agent there is no chat to "detect" the
 * user's language from — the model would only see English instructions and
 * introduce itself in English (PRODUCT-1257). The active app locale is the
 * ground truth, so the prompt states it outright.
 *
 * The user has already READ the agent's hello when this prompt runs: the chat
 * derives it from the agent's name and job and renders it as the mission's
 * first item, permanently (`setup-mission-greeting.ts`). So the prompt's job is
 * the opposite of an introduction — it quotes that message back to the model
 * and forbids greeting again, and the first reply continues from it.
 *
 * The whole conversation aims at ONE outcome: the user leaves with at least one
 * Skill saved, because a Skill is the first thing they actually automated.
 * Nothing happens before the first reply, no tool call, no self-writing: the
 * name and the job are enough to start talking, and every second before the
 * first word is the user staring at a card.
 */

import { outputLanguageName } from "../components/onboarding/personal-assistant-seeds.ts";
import type { AgentRoleContext } from "./agent-role-context.ts";

function languageNote(languageName: string): string {
  return `**LANGUAGE — read this first.** The user's app is set to ${languageName}. Write this ENTIRE conversation in ${languageName}: every question you ask and every choice or option you offer the user. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). If the user writes to you in a different language, switch to theirs and stay there. Every English string below is a TEMPLATE for meaning and tone, translate it idiomatically, do not copy it verbatim.`;
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

That brief is your starting point: every idea you offer must be specific to it. ${NEVER_FROM_NAME}`;
}

/** Word for word what the chat already shows above your first reply (the
 *  English source of `chat:setupGreeting.*`), so the model can see there is
 *  nothing left to introduce. */
function alreadySaidNote(
  agentName: string,
  roleContext: AgentRoleContext | undefined,
): string {
  const opening = roleContext
    ? `Hi, I'm ${agentName}, your ${roleContext.role}.`
    : `Hi, I'm ${agentName}.`;
  return `The user has ALREADY seen this exact message from you, in their own language, at the top of this conversation:

"${opening} Give me a few seconds to get going. The most important thing we'll do together is create Skills, so you start automating your work."

Do NOT greet the user, do NOT introduce yourself, and do NOT say any of that again in any words. Your first reply continues straight on from it.`;
}

/** The ideas lead with REPEATABLE work, because a process the agent can own is
 *  what turns this conversation into a saved Skill rather than a one-off
 *  favour. They are offered as tappable options rather than prose: a
 *  non-technical user picks far more readily than they compose an answer. */
function ideasStep(roleContext: AgentRoleContext | undefined): string {
  const ideas = roleContext
    ? `3 concrete, specific jobs in ${roleContext.context} that this ${roleContext.role} repeats the same way every time`
    : `3 concrete, specific example missions you could run for them`;
  return `Reply with ONE short line and nothing more, saying that you already have a few ideas of work you could take over. In that SAME turn, call the \`ask_user\` tool with ONE question asking which one they want to start with, and give that question 4 options (each an \`{id, label}\` row, single-select): ${ideas}. Never a category like "reporting" or "admin", name the actual job, and keep each label short enough to read on a button. The 4th option is labeled "Suggest other ideas", translated like every other label; it is the one place \`ask_user\` takes a catch-all choice, so include it here even though the tool tells you not to. The options MUST be offered through \`ask_user\`, never written out as a list in your reply, so the user can tap one instead of typing. Then end your turn. If they pick "Suggest other ideas", ask again in exactly the same shape with 3 DIFFERENT jobs.`;
}

const SKILL_STEP = `Once they pick one, turn it into a Skill together, fast: ask only the 2 or 3 questions you truly need (where the inputs come from, what the result should look like, who gets it), then save the procedure as a Skill and confirm in one short line what it does. Then offer to run it or to set up the next one.`;

const CAPTURE_STEP = `Along the way, save what they tell you the moment they say it, never later: a lasting preference or fact about how you should work goes into your instructions; anything they want on a schedule becomes a Routine, after you confirm the time with them.`;

/**
 * Build the hidden setup-mission prompt for the named agent: same non-technical
 * voice as every Houston agent (never mention files, folders, configs, or
 * internals), framed as a short conversation that ends with a saved Skill.
 * `locale` is the active app language (e.g. `"es"`), which pins the language of
 * the whole first conversation.
 */
export function buildSetupMissionPrompt(
  agentName: string,
  locale: string,
  roleContext?: AgentRoleContext,
): string {
  const languageName = outputLanguageName(locale);
  const steps = [ideasStep(roleContext), SKILL_STEP, CAPTURE_STEP];
  const numbered = steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n\n");
  return `This is ${agentName}'s very first conversation with the user. Make a warm, human first impression and get them automating something today. Keep every reply short and warm. Never mention files, folders, configs, or any technical internals, speak in terms of the work you do for them.

${languageNote(languageName)}

${alreadySaidNote(agentName, roleContext)}

${jobNote(roleContext)}

Do this, in order:

${numbered}

The one outcome of this conversation: at least one repeatable process saved as a Skill. Never ask a long list of questions up front, and never do anything before your first reply.`;
}
