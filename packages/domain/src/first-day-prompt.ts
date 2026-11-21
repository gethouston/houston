import { englishSetupGreeting } from "@houston/domain/first-day-greeting";
import { parseJobDescription } from "@houston/domain/job-description";

export interface FirstDayBrief {
  context: string;
  role: string;
}

const clean = (value: string | null): string =>
  (value ?? "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

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

export function outputLanguageName(locale: string): string {
  const base = locale.split("-")[0]?.toLowerCase() ?? "en";
  return LANGUAGE_NAMES[base] ?? "English";
}

function languageNote(languageName: string): string {
  return `**LANGUAGE — read this first.** The user's app is set to ${languageName}. Write this ENTIRE conversation in ${languageName}: every question you ask and every choice or option you offer the user. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). If the user writes to you in a different language, switch to theirs and stay there. Every English string below is a TEMPLATE for meaning and tone, translate it idiomatically, do not copy it verbatim.`;
}

const NEVER_FROM_NAME =
  "Do not use your name to infer your role, industry, responsibilities, tools, or goals.";

function jobNote(brief: FirstDayBrief | undefined): string {
  if (!brief) return NEVER_FROM_NAME;
  return `The user already told you the job they hired you for:
- Industry: ${brief.context}
- Role: ${brief.role}

That brief is your starting point: every idea you offer must be specific to it. ${NEVER_FROM_NAME}`;
}

function alreadySaidNote(
  agentName: string,
  brief: FirstDayBrief | undefined,
): string {
  const greeting = englishSetupGreeting(agentName, brief?.role ?? null);
  return `The user has ALREADY seen this exact message from you, in their own language, at the top of this conversation:

"${greeting}"

Do NOT greet the user, do NOT introduce yourself, and do NOT say any of that again in any words. Your first reply continues straight on from it.`;
}

function ideasStep(brief: FirstDayBrief | undefined): string {
  const ideas = brief
    ? `3 concrete, specific jobs in ${brief.context} that this ${brief.role} repeats the same way every time`
    : `3 concrete, specific example missions you could run for them`;
  return `Your very first action is a call to the \`ask_user\` tool. Do not write a text reply first: a text-only reply here is wrong, the card IS your first reply. The greeting above already ends with "Here are a few tasks we could start with:", so the card follows it directly: give it ONE question whose text is a short follow-on to that line, like "Which one should we start with?", never announcing again that you have ideas, and give that question 4 options (each an \`{id, label}\` row, single-select): ${ideas}. Never a category like "reporting" or "admin", name the actual job, and keep each label short enough to read on a button. The 4th option is labeled "Suggest other ideas", translated like every other label; it is the one place \`ask_user\` takes a catch-all choice, so include it here even though the tool tells you not to. The options MUST be offered through \`ask_user\`, never written out as a list, so the user can tap one instead of typing. If they pick "Suggest other ideas", ask again in exactly the same shape with 3 DIFFERENT jobs.`;
}

const DO_IT_STEP = `Once they pick one, DO that job with them right now, for real: ask only the 2 or 3 questions you truly need (where the inputs come from, what the result should look like, who gets it), then produce the actual result on a real case they give you (real names, a real week, a real draft), show it, and adjust it to their feedback. The point of this conversation is that they see the work done, not a description of it.`;

const SKILL_STEP = `As soon as the result is right, save the way you did it as a Skill, confirm in one short line what it does, and tell them it will keep improving as they run it on real cases. Then offer to run it again or to take on the next job.`;

const CAPTURE_STEP = `Along the way, save what they tell you the moment they say it, never later: a lasting preference or fact about how you should work goes into your instructions; anything they want on a schedule becomes a Routine, after you confirm the time with them.`;

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
