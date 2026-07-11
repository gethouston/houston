/**
 * The Claude-facing kickoffs for an EVENT-driven reaction's setup chat (the
 * Reactions tab). A reaction is a routine that wakes on an event in a connected
 * app instead of on a clock, so these kickoffs steer the agent to pick an app +
 * event and write the routine's `trigger` binding (never a `schedule`). The
 * schedule-driven counterpart lives in `routine-chat-prompts.ts`.
 */

import { encodeAutoContinueMessage } from "./auto-continue-message.ts";
import {
  type ConnectedProviderRef,
  providerAwareness,
} from "./setup-chat-prompt-shared.ts";

/**
 * The create kickoff. Takes the setup chat's own activity id so the agent can
 * link the reaction back to it, and the user's connected providers so it never
 * pins an unconnected one.
 */
export function reactionSetupPrompt(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return `Houston sent this message automatically: the user clicked "New reaction" and picked "With AI". This chat is where you set it up, and it stays attached to the reaction forever — the user can come back to it any time to change it. The user has not said anything yet and is waiting for you to start.

Your job in this conversation: guide the user through creating ONE new reaction, then create it. A reaction is a routine that wakes on an EVENT in one of the user's connected apps — a new email arrives, a message is posted, a file changes — NOT on a clock. So it must have an event trigger and must NOT have a schedule.

Start RIGHT NOW, in this same turn, with a SINGLE ask_user call — do not write anything before it, and do not spend a separate turn on a greeting first (every turn costs the user real money, so get straight to the point). Fold a brief, friendly framing INTO the question itself (match the user's language): mention you'll help them set this up and they can always come back to this same chat to change it later, then ask what should happen and in which app the triggering event lives. Offer 3 or 4 concrete example options based on what you help this user with (for example "When a new email arrives, summarize it for me", "When someone messages me on Slack, draft a reply", "When a new file lands, file it away"), and they can always describe their own idea instead. A turn that ends without an ask_user call is a mistake, until the reaction is created.

Interview rules:
- Ask exactly ONE question per ask_user call. Never batch several questions into one call here, even though your general guidance allows up to 3. One question, wait for the answer, then the next.
- Offer answer options whenever the question allows it (app choices, event choices, yes/no).
- Keep every message to a couple of short sentences, friendly and non-technical. Never mention files, JSON, schemas, tools, or field names.
- If an earlier answer already covers a later question, skip that question.

What you need to learn, one step at a time:
1. What should happen when the reaction fires, plus any details you need to do it well.
2. Which connected app the triggering event lives in, and exactly which event should wake it. It MUST be an app the user has actually connected — if the app they want is not connected, help them connect it first.
3. Any filters that narrow WHEN it fires (for example only emails from a certain sender, or a specific channel), if the user wants them.
4. Whether every run should add to one ongoing chat, or each run should start a fresh chat.
5. Whether they want to hear about every run, or only when something needs their attention.

Do not ask about models, providers, or other technical settings — the reaction uses this agent's settings unless the user brings it up. Propose a short name yourself.

${providerAwareness(connectedProviders)}

When you have everything, summarize the reaction in a few plain lines (what wakes it, and what it does) and ask for approval with ask_user (Yes / No). Only create it after a Yes. Save it as a routine whose trigger names the chosen app, event, and any filters, and give it NO schedule. Set its "setup_activity_id" field to exactly "${activityId}" — that keeps this chat attached to it; never mention this field or any other technical detail to the user. Then confirm it is set up and remind them they can change it right here, in this same chat, any time.`;
}

/**
 * The kickoff for a reaction that has no chat yet (created manually, or from
 * before chats were persisted). One calm greeting, no interview — it already
 * exists.
 */
export function reactionModifyPrompt(
  routine: { id: string; name: string },
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return `Houston sent this message automatically: the user opened their existing reaction "${routine.name}" and picked "Edit with AI". This chat stays attached to this reaction from now on. The user has not said anything yet.

Right now, write exactly one short, friendly line (match the user's language) saying you can change this reaction for them any time — what wakes it, what it does, anything — they just have to tell you. Do not ask a question, do not call ask_user, and end your turn after that single line.

Later in this conversation, when the user asks for changes: update THIS reaction — the routine whose id is "${routine.id}" — in place. Never create a second one for a change request. Keep it event-driven: change only the fields the user asked about, keep its trigger (never swap it for a schedule) unless they ask to change what wakes it, and keep every other field exactly as it already is on disk. Ask for approval with ask_user (Yes / No) before saving a change, keep every message short and non-technical, and never mention files, JSON, schemas, ids, or field names to the user.

${providerAwareness(connectedProviders)}`;
}

/**
 * The full first-message body for a new-reaction chat: marker (hides the
 * bubble) + create kickoff (what the model acts on).
 */
export function encodeReactionSetupMessage(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return encodeAutoContinueMessage(
    reactionSetupPrompt(activityId, connectedProviders),
  );
}

/** The full first-message body for an existing reaction's first-ever chat. */
export function encodeReactionModifyMessage(
  routine: { id: string; name: string },
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return encodeAutoContinueMessage(
    reactionModifyPrompt(routine, connectedProviders),
  );
}
