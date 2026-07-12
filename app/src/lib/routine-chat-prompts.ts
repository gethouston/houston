/**
 * The Claude-facing kickoffs for a SCHEDULE-driven routine's setup chat (the
 * Routines tab). English on purpose (all prompts are); the agent mirrors the
 * user's language when it answers. They ride the auto-continue marker
 * (`lib/auto-continue-message.ts`): the user never typed anything, so the
 * transcript hides the bubble and the conversation opens with the agent's
 * greeting. The event-driven counterpart lives in `reaction-chat-prompts.ts`.
 */

import { encodeAutoContinueMessage } from "./auto-continue-message.ts";
import {
  type ConnectedProviderRef,
  providerAwareness,
} from "./setup-chat-prompt-shared.ts";

/**
 * The create kickoff. Takes the setup chat's own activity id so the agent can
 * link the routine back to it, and the user's connected providers so it never
 * pins an unconnected one.
 */
export function routineSetupPrompt(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return `Houston sent this message automatically: the user clicked "New routine" and picked "With AI". This chat is where you set it up, and it stays attached to the routine forever — the user can come back to it any time to change the routine. The user has not said anything yet and is waiting for you to start.

Your job in this conversation: guide the user through creating ONE new Routine, then create it.

Start RIGHT NOW, in this same turn, with a SINGLE ask_user call — do not write anything before it, and do not spend a separate turn on a greeting first (every turn costs the user real money, so get straight to the point). Fold a brief, friendly framing INTO the question itself (match the user's language): mention you'll help them set this up and they can always come back to this same chat to change it later, then ask what the routine should do for them. Offer 3 or 4 concrete example options based on what you help this user with (for example "Watch my inbox for anything urgent", "Send me a morning summary of my day", "Remind me before deadlines"), and they can always describe their own idea instead. A turn that ends without an ask_user call is a mistake, until the routine is created.

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

Do not ask about models, providers, or other technical settings — the routine uses this agent's settings unless the user brings it up. Propose a short name yourself.

${providerAwareness(connectedProviders)}

When you have everything, summarize the routine in a few plain lines and ask for approval with ask_user (Yes / No). Only create it after a Yes. When you save the routine, set its "setup_activity_id" field to exactly "${activityId}" — that keeps this chat attached to it; never mention this field or any other technical detail to the user. Then confirm it is scheduled and remind them they can change it right here, in this same chat, any time.`;
}

/**
 * The kickoff for a routine that has no chat yet (created manually, or from
 * before chats were persisted). One calm greeting, no interview — the routine
 * already exists.
 */
export function routineModifyPrompt(
  routine: { id: string; name: string },
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return `Houston sent this message automatically: the user opened their existing routine "${routine.name}" and picked "Edit with AI". This chat stays attached to this routine from now on. The user has not said anything yet.

Right now, write exactly one short, friendly line (match the user's language) saying you can change this routine for them any time — what it does, when it runs, anything — they just have to tell you. Do not ask a question, do not call ask_user, and end your turn after that single line.

Later in this conversation, when the user asks for changes: update THIS routine — the one whose id is "${routine.id}" — in place. Never create a second routine for a change request. Change only the fields the user asked about and keep every other field of the routine's entry exactly as it already is on disk. Ask for approval with ask_user (Yes / No) before saving a change, keep every message short and non-technical, and never mention files, JSON, schemas, ids, or field names to the user.

${providerAwareness(connectedProviders)}`;
}

/**
 * The full first-message body for a new-routine chat: marker (hides the
 * bubble) + create kickoff (what the model acts on).
 */
export function encodeRoutineSetupMessage(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return encodeAutoContinueMessage(
    routineSetupPrompt(activityId, connectedProviders),
  );
}

/** The full first-message body for an existing routine's first-ever chat. */
export function encodeRoutineModifyMessage(
  routine: { id: string; name: string },
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return encodeAutoContinueMessage(
    routineModifyPrompt(routine, connectedProviders),
  );
}
