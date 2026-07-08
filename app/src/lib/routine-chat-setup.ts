/**
 * "Create a routine in chat" — the guided alternative to the routine form.
 *
 * The kickoff rides the auto-continue marker (`lib/auto-continue-message.ts`):
 * the user never typed anything, so the transcript hides the bubble on both
 * the optimistic and reload paths, and the conversation opens with the
 * AGENT's greeting + first question. The product prompt's Routines guidance
 * (schema-checked save, approval gate) does the heavy lifting; this prompt
 * kicks it off and slows the interview down to one question per turn.
 */

import { encodeAutoContinueMessage } from "./auto-continue-message.ts";

/**
 * Sentinel stored in the activity's `agent` (mode) field so every mission
 * surface can recognize a routine-setup chat. Namespaced with `houston:` so
 * it can never collide with a user-defined agent-mode id, and reusing the
 * existing field means no schema change and the value already flows through
 * the conversation adapters (HOU-665 keeps `agent` alive end to end).
 */
export const ROUTINE_SETUP_AGENT_MODE = "houston:routine-setup";

/** True when an activity's `agent` (mode) marks it as a routine-setup chat. */
export function isRoutineSetupMode(agent: string | null | undefined): boolean {
  return agent === ROUTINE_SETUP_AGENT_MODE;
}

/**
 * The Claude-facing kickoff. English on purpose (all prompts are); the
 * agent mirrors the user's language when it answers.
 */
export const ROUTINE_SETUP_PROMPT = `Houston sent this message automatically: the user clicked "New routine" and chose to set it up here in chat. The user has not said anything yet and is waiting for you to start.

Your job in this conversation: guide the user through creating ONE new Routine, then create it.

Start RIGHT NOW, in this same turn:
1. Write exactly one short, friendly opening line (match the user's language; no headings, no lists, no explanations).
2. Then, still in this turn, call the ask_user tool with your first question: what the routine should do for them. Offer 3 or 4 concrete example options based on what you help this user with (for example "Watch my inbox for anything urgent", "Send me a morning summary of my day", "Remind me before deadlines"), and they can always describe their own idea instead.
Do not stop after the greeting. In this conversation, a turn that ends without an ask_user call is a mistake, until the routine is created.

Interview rules:
- Ask exactly ONE question per ask_user call. Never batch several questions into one call here, even though your general guidance allows up to 3. One question, wait for the answer, then the next.
- Offer answer options whenever the question allows it (schedule choices, yes/no, app choices).
- Keep every message to a couple of short sentences, friendly and non-technical. Never mention files, JSON, schemas, tools, or field names.
- If an earlier answer already covers a later question, skip that question.

What you need to learn, one step at a time:
1. What the routine should do, plus any details you need to do it well.
2. When it should run (how often, and at what time).
3. Which of their connected apps it should use, if the task touches email, calendar, or other apps.
4. Whether every run should add to one ongoing chat, or each run should start a fresh chat.
5. Whether they want to hear about every run, or only when something needs their attention.

Do not ask about models, providers, or other technical settings. The routine uses this agent's settings. Propose a short name and a one-line description yourself.

When you have everything, summarize the routine in a few plain lines and ask for approval with ask_user (Yes / No). Only create it after a Yes. Then confirm it is scheduled and mention they can see it, change it, or pause it anytime in this agent's Routines tab.`;

/**
 * The full first-message body: marker (hides the bubble) + kickoff prompt
 * (what the model acts on).
 */
export function encodeRoutineSetupMessage(): string {
  return encodeAutoContinueMessage(ROUTINE_SETUP_PROMPT);
}
