/**
 * The Claude-facing kickoffs for an automation's setup chat (the Automations
 * tab). English on purpose (all prompts are); the agent mirrors the user's
 * language when it answers. They ride the auto-continue marker
 * (`lib/auto-continue-message.ts`): the user never typed anything, so the
 * transcript hides the bubble and the conversation opens with the agent's
 * greeting.
 *
 * One prompt serves both wake mechanisms — a cron `schedule` or (where the
 * deployment supports event triggers, C9) an event in a connected app. The
 * caller passes `eventsAvailable`; when false the prompt never offers the
 * event option, so the agent can't promise something the deployment can't do.
 */

import { encodeAutoContinueMessage } from "./auto-continue-message.ts";
import {
  type ConnectedProviderRef,
  providerAwareness,
} from "./setup-chat-prompt-shared.ts";

/** How the create kickoff explains the wake choice, by deployment capability. */
function wakeGuidance(eventsAvailable: boolean): string {
  if (!eventsAvailable) {
    return `2. When it should run (how often, and at what time).`;
  }
  return `2. When it should happen. There are two ways a routine wakes, and the user picks in plain words:
   - On a schedule (how often, and at what time), OR
   - The moment something happens in one of their connected apps (a new email arrives, a message is posted, a file changes). If they choose this, learn which connected app the event lives in and exactly which event should wake it — it MUST be an app the user has actually connected; if the app they want is not connected, help them connect it first. Also ask about any filters that narrow WHEN it fires (for example only emails from a certain sender, or a specific channel), if the user wants them.`;
}

/** The wake rule the agent must follow when it finally saves. */
function wakeSaveRule(eventsAvailable: boolean): string {
  if (!eventsAvailable) {
    return `Save it as a routine with the agreed schedule.`;
  }
  return `Save it as a routine with exactly ONE wake mechanism, matching what the user chose: either the agreed schedule (and no trigger), or a trigger naming the chosen app, event, and any filters (and no schedule).`;
}

/**
 * The create kickoff. Takes the setup chat's own activity id so the agent can
 * link the automation back to it, the user's connected providers so it never
 * pins an unconnected one, and whether event triggers exist on this deployment.
 */
export function routineSetupPrompt(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
  eventsAvailable: boolean,
): string {
  return `Houston sent this message automatically: the user clicked "New routine" and picked "With AI". This chat is where you set it up, and it stays attached to the routine forever — the user can come back to it any time to change it. The user has not said anything yet and is waiting for you to start.

Your job in this conversation: guide the user through creating ONE new routine, then create it. A routine is work you do for the user without them asking each time${eventsAvailable ? " — on a schedule, or the moment something happens in one of their connected apps" : ", on a schedule"}.

Start RIGHT NOW, in this same turn, with a SINGLE ask_user call — do not write anything before it, and do not spend a separate turn on a greeting first (every turn costs the user real money, so get straight to the point). Fold a brief, friendly framing INTO the question itself (match the user's language): mention you'll help them set this up and they can always come back to this same chat to change it later, then ask what the routine should do for them. Offer 3 or 4 concrete example options based on what you help this user with (for example "Send me a morning summary of my day", "Remind me before deadlines"${eventsAvailable ? ', "When a new email arrives, summarize it for me"' : ""}), and they can always describe their own idea instead. A turn that ends without an ask_user call is a mistake, until the routine is created.

Interview rules:
- BATCH the questions: put everything you need into as FEW ask_user calls as possible — ideally exactly ONE call carrying up to 3 questions, so the user sees the whole picture at once instead of a drip of one question per turn. Only make a follow-up ask_user call if an answer genuinely opens something you could not have asked up front.
- Offer answer options for every question that allows it (schedule choices, app choices, yes/no).
- Keep every message to a couple of short sentences, friendly and non-technical. Never mention files, JSON, schemas, tools, or field names.
- If an answer already covers another question, drop that question; prefer sensible defaults over extra rounds.

What you need to learn (batch these into that first call wherever possible):
1. What the routine should do, plus any details you need to do it well.
${wakeGuidance(eventsAvailable)}
3. Which of their connected apps it should use, if the task touches email, calendar, or other apps.
4. Whether every run should add to one ongoing chat, or each run should start a fresh chat.
5. Whether they want to hear about every run, or only when something needs their attention.

Do not ask about models, providers, or other technical settings — the routine uses this agent's settings unless the user brings it up. Propose a short name yourself.

${providerAwareness(connectedProviders)}

When you have everything, summarize the routine in a few plain lines (what wakes it, and what it does) and ask for approval with ask_user (Yes / No). Only create it after a Yes. ${wakeSaveRule(eventsAvailable)} Set its "setup_activity_id" field to exactly "${activityId}" — that keeps this chat attached to it; never mention this field or any other technical detail to the user. Then confirm it is set up and remind them they can change it right here, in this same chat, any time.`;
}

/**
 * The kickoff for an automation that has no chat yet (created manually, or
 * from before chats were persisted). One calm greeting, no interview — it
 * already exists.
 */
export function routineModifyPrompt(
  routine: { id: string; name: string },
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return `Houston sent this message automatically: the user opened their existing routine "${routine.name}" and picked "Edit with AI". This chat stays attached to this routine from now on. The user has not said anything yet.

Right now, write exactly one short, friendly line (match the user's language) saying you can change this routine for them any time — what it does, when it happens, anything — they just have to tell you. Do not ask a question, do not call ask_user, and end your turn after that single line.

Later in this conversation, when the user asks for changes: update THIS routine — the one whose id is "${routine.id}" — in place. Never create a second one for a change request. Change only the fields the user asked about, keep how it wakes (its schedule or its trigger) unless they ask to change when it happens, and keep every other field exactly as it already is on disk. A routine always has exactly ONE wake mechanism: a schedule or a trigger, never both. Ask for approval with ask_user (Yes / No) before saving a change, keep every message short and non-technical, and never mention files, JSON, schemas, ids, or field names to the user.

${providerAwareness(connectedProviders)}`;
}

/**
 * The full first-message body for a new-automation chat: marker (hides the
 * bubble) + create kickoff (what the model acts on).
 */
export function encodeRoutineSetupMessage(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
  eventsAvailable: boolean,
): string {
  return encodeAutoContinueMessage(
    routineSetupPrompt(activityId, connectedProviders, eventsAvailable),
  );
}

/** The full first-message body for an existing automation's first-ever chat. */
export function encodeRoutineModifyMessage(
  routine: { id: string; name: string },
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return encodeAutoContinueMessage(
    routineModifyPrompt(routine, connectedProviders),
  );
}
