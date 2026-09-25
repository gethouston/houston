/**
 * The hidden first-day prompt: what an AI Employee is told when its setup task
 * starts (`POST /agents/:agentId/first-day`, built on the host so every surface
 * that starts a first day sends the same words).
 *
 * The language directive must be explicit: the whole first message is hidden
 * from the transcript, so on a brand-new agent there is no chat to "detect" the
 * user's language from — the model would only see English instructions and
 * introduce itself in English (PRODUCT-1257). The surface's app locale is the
 * ground truth, so the prompt states it outright.
 *
 * The user has already READ the agent's hello when this prompt runs: the chat
 * derives it from the agent's name and job and renders it as the mission's
 * first item, permanently (`first-day-greeting.ts`). So the prompt's job is
 * the opposite of an introduction — it quotes that message back to the model
 * and forbids greeting again, and the first reply continues from it.
 *
 * The whole conversation aims at ONE outcome: one real job done together and
 * then saved as a Skill. Doing it first is what makes the Skill real: a
 * procedure written before it ever ran is a guess, and the user has seen
 * nothing work.
 * Nothing happens before the first reply, no tool call, no self-writing: the
 * name and the job are enough to start talking, and every second before the
 * first word is the user staring at a card.
 */

// Package subpaths rather than relative imports: the e2e fake host loads this
// module under Node's own loader, where the barrel's JSON schema imports and
// extensionless relative imports do not resolve.
import { englishSetupGreeting } from "@houston/domain/first-day-greeting";
import { parseJobDescription } from "@houston/domain/job-description";

/** The industry and job an employee was hired for. */
export interface FirstDayBrief {
  context: string;
  role: string;
}

const clean = (value: string | null): string =>
  (value ?? "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

/**
 * The brief an employee's job description (`CLAUDE.md`) carries. Both facts or
 * neither: the role sentence names the job in the industry it is done in, and
 * half a brief is not one.
 */
export function firstDayBrief(
  instructions: string | null | undefined,
): FirstDayBrief | undefined {
  if (!instructions) return undefined;
  const { industry, role } = parseJobDescription(instructions).fields;
  const context = clean(industry);
  const job = clean(role);
  return context && job ? { context, role: job } : undefined;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
};

/**
 * The human-readable language name for a locale code (`"es-419"` → `"Spanish"`),
 * used to tell an AI Employee which language to write its user-facing output
 * in. Falls back to English for anything unmapped.
 */
export function outputLanguageName(locale: string): string {
  const base = locale.split("-")[0]?.toLowerCase() ?? "en";
  return LANGUAGE_NAMES[base] ?? "English";
}

function languageNote(languageName: string): string {
  return `**LANGUAGE — read this first.** The user's app is set to ${languageName}. Write this ENTIRE conversation in ${languageName}: every question you ask and every choice or option you offer the user. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). If the user writes to you in a different language, switch to theirs and stay there. Every English string below is a TEMPLATE for meaning and tone, translate it idiomatically, do not copy it verbatim.`;
}

const NEVER_FROM_NAME =
  "Do not use your name to infer your role, industry, responsibilities, tools, or goals.";

/** The brief the agent was hired with, when its job description names one
 *  (`firstDayBrief`). The whole point of holding it is that the agent starts
 *  specific instead of guessing. */
function jobNote(brief: FirstDayBrief | undefined): string {
  if (!brief) return NEVER_FROM_NAME;
  return `The user already told you the job they hired you for:
- Industry: ${brief.context}
- Role: ${brief.role}

That brief is your starting point: every idea you offer must be specific to it. ${NEVER_FROM_NAME}`;
}

/** Word for word what the chat already shows above your first reply, built by
 *  the same function that pins the en `chat:setupGreeting.*` copy, so the
 *  model can see there is nothing left to introduce. */
function alreadySaidNote(
  agentName: string,
  brief: FirstDayBrief | undefined,
): string {
  const greeting = englishSetupGreeting(agentName, brief?.role ?? null);
  return `The user has ALREADY seen this exact message from you, in their own language, at the top of this conversation:

"${greeting}"

Do NOT greet the user, do NOT introduce yourself, and do NOT say any of that again in any words. Your first reply continues straight on from it.`;
}

/** The ideas lead with REPEATABLE work, because a process the agent can own is
 *  what turns this conversation into a saved Skill rather than a one-off
 *  favour. They are offered as tappable options rather than prose: a
 *  non-technical user picks far more readily than they compose an answer. */
function ideasStep(brief: FirstDayBrief | undefined): string {
  const ideas = brief
    ? `3 concrete, specific jobs in ${brief.context} that this ${brief.role} repeats the same way every time`
    : `3 concrete, specific example missions you could run for them`;
  return `Your very first action is a call to the \`ask_user\` tool. Do not write a text reply first: a text-only reply here is wrong, the card IS your first reply. The greeting above already ends with "Here are a few tasks we could start with:", so the card follows it directly: give it ONE question whose text is a short follow-on to that line, like "Which one should we start with?", never announcing again that you have ideas, and give that question 4 options (each an \`{id, label}\` row, single-select): ${ideas}. Never a category like "reporting" or "admin", name the actual job, and keep each label short enough to read on a button. The 4th option is labeled "Suggest other ideas", translated like every other label; it is the one place \`ask_user\` takes a catch-all choice, so include it here even though the tool tells you not to. The options MUST be offered through \`ask_user\`, never written out as a list, so the user can tap one instead of typing. If they pick "Suggest other ideas", ask again in exactly the same shape with 3 DIFFERENT jobs.`;
}

const DO_IT_STEP = `Once they pick one, DO that job with them right now, for real: ask only the 2 or 3 questions you truly need (where the inputs come from, what the result should look like, who gets it), then produce the actual result on a real case they give you (real names, a real week, a real draft), show it, and adjust it to their feedback. The point of this conversation is that they see the work done, not a description of it.`;

const SKILL_STEP = `As soon as the result is right, save the way you did it as a Skill, confirm in one short line what it does, and tell them it will keep improving as they run it on real cases. Then offer to run it again or to take on the next job.`;

const CAPTURE_STEP = `Along the way, save what they tell you the moment they say it, never later: a lasting preference or fact about how you should work goes into your instructions; anything they want on a schedule becomes a Routine, after you confirm the time with them.`;

/**
 * Build the hidden first-day prompt for the named agent: same non-technical
 * voice as every Houston agent (never mention files, folders, configs, or
 * internals), framed as a short conversation that ends with a saved Skill.
 * `locale` is the user's app language (e.g. `"es"`), which pins the language of
 * the whole first conversation.
 */
export function buildFirstDayPrompt(
  agentName: string,
  locale: string,
  brief?: FirstDayBrief,
): string {
  const languageName = outputLanguageName(locale);
  const steps = [ideasStep(brief), DO_IT_STEP, SKILL_STEP, CAPTURE_STEP];
  const numbered = steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n\n");
  return `This is ${agentName}'s very first conversation with the user. Make a warm, human first impression and get them automating something today. Keep every reply short and warm. Never mention files, folders, configs, or any technical internals, speak in terms of the work you do for them.

${languageNote(languageName)}

${alreadySaidNote(agentName, brief)}

${jobNote(brief)}

Do this, in order:

${numbered}

The one outcome of this conversation: one real job done together, then saved as a Skill. Never ask a long list of questions up front, never save a Skill before the job is done once, and never do anything before your first reply.`;
}
