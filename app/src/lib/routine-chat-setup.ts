/**
 * The routine setup chat — the persistent conversation shown next to the
 * routine form (HOU-725). Every routine gets exactly one: creating a routine
 * starts it, and reopening the routine resumes the very same chat, so the
 * user can keep modifying the routine by talking to the agent.
 *
 * The kickoffs ride the auto-continue marker (`lib/auto-continue-message.ts`):
 * the user never typed anything, so the transcript hides the bubble on both
 * the optimistic and reload paths, and the conversation opens with the
 * AGENT's greeting. The product prompt's Routines guidance (schema-checked
 * save, approval gate) does the heavy lifting; these prompts kick it off.
 *
 * The chat↔routine link is stored in both directions — the routine's
 * `setup_activity_id` (written by the agent on chat-created routines, by the
 * client otherwise) and the activity's `routine_id` (client-stamped, durable
 * because agents never rewrite activity.json). See the resolution helpers
 * below for why one direction is not enough.
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

// ── Chat ↔ routine link resolution (pure, unit-tested) ────────────────────
//
// The link is stored in BOTH directions because neither alone is durable:
// `routine.setup_activity_id` lives in routines.json, which the AGENT
// rewrites when it modifies a routine — one careless save drops the field
// and the chat would vanish mid-conversation. `activity.routine_id` lives in
// activity.json, which agents never touch, so the reverse link survives; the
// heal below then restores the forward link on disk.

interface SetupActivityLike {
  id: string;
  agent?: string | null;
  status?: string;
  routine_id?: string;
}
interface RoutineLinkLike {
  id: string;
  setup_activity_id?: string | null;
}

/** The chat attached to a routine: reverse link first (durable), then forward. */
export function findRoutineChatActivity<A extends SetupActivityLike>(
  activities: A[] | undefined,
  routine: RoutineLinkLike,
): A | null {
  const items = activities ?? [];
  return (
    items.find(
      (a) => isRoutineSetupMode(a.agent) && a.routine_id === routine.id,
    ) ??
    (routine.setup_activity_id
      ? (items.find((a) => a.id === routine.setup_activity_id) ?? null)
      : null)
  );
}

/**
 * The agent's one live create-chat: a setup chat no routine has claimed yet
 * (neither by forward link nor by its own `routine_id` stamp).
 */
export function findDraftSetupActivity<A extends SetupActivityLike>(
  activities: A[] | undefined,
  routines: RoutineLinkLike[] | undefined,
): A | undefined {
  const claimed = new Set<string>();
  for (const r of routines ?? []) {
    if (r.setup_activity_id) claimed.add(r.setup_activity_id);
  }
  return (activities ?? []).find(
    (a) =>
      isRoutineSetupMode(a.agent) &&
      a.status !== "archived" &&
      !a.routine_id &&
      !claimed.has(a.id),
  );
}

export type RoutineChatHeal =
  | { kind: "stamp_activity"; activityId: string; routineId: string }
  | { kind: "stamp_routine"; activityId: string; routineId: string };

/**
 * The next link repair to apply, or null when everything is consistent.
 * One fix at a time — the caller applies it, queries refetch, and this runs
 * again until it returns null (each rule strictly reduces inconsistency, so
 * the loop terminates).
 */
export function findRoutineChatHeal(
  activities: SetupActivityLike[] | undefined,
  routines: RoutineLinkLike[] | undefined,
): RoutineChatHeal | null {
  const acts = activities ?? [];
  for (const r of routines ?? []) {
    // Forward link present but the activity is missing its reverse stamp
    // (agent-created routines, form-created claims): make the link durable.
    // Only stamp an unstamped activity — never reassign one.
    if (r.setup_activity_id) {
      const a = acts.find((x) => x.id === r.setup_activity_id);
      if (a && isRoutineSetupMode(a.agent) && !a.routine_id) {
        return { kind: "stamp_activity", activityId: a.id, routineId: r.id };
      }
    }
    // Reverse link present but the forward one is gone or dangling (the
    // agent rewrote the routine and dropped it): restore it on the routine.
    const back = acts.find(
      (x) => isRoutineSetupMode(x.agent) && x.routine_id === r.id,
    );
    if (
      back &&
      r.setup_activity_id !== back.id &&
      !acts.some((x) => x.id === r.setup_activity_id)
    ) {
      return { kind: "stamp_routine", activityId: back.id, routineId: r.id };
    }
  }
  return null;
}

/** A provider the user has actually connected, for the kickoff prompts. */
export interface ConnectedProviderRef {
  id: string;
  name: string;
}

/**
 * The kickoffs tell the agent which model providers the user actually has
 * connected: without this it happily pins a routine to any provider the user
 * names (e.g. "use deepseek"), and the routine then fails at fire time.
 * `null` means the statuses haven't loaded yet — stay generic rather than
 * wrongly claiming nothing is connected.
 */
function providerAwareness(connected: ConnectedProviderRef[] | null): string {
  if (connected === null) {
    return `Model providers: a routine can pin a specific provider and model, but only ones the user has actually connected in this app. If the user asks for a specific provider or model and you cannot confirm it is connected, do not set it — leave the routine's model setup unchanged and suggest they check the app's model settings.`;
  }
  const list = connected.length
    ? connected.map((c) => `"${c.id}" (${c.name})`).join(", ")
    : "none";
  return `Model providers: the only providers connected for this user are: ${list}. A routine's "provider" may only be one of those ids (or absent, to use this agent's own settings), and its "model" only a model that belongs to that provider. If the user asks to run the routine on any other provider or model, do NOT set it: tell them that provider is not connected yet (they can connect it from the app's model settings) and leave the routine's model setup unchanged. Never invent provider or model names.`;
}

/**
 * The Claude-facing create kickoff. English on purpose (all prompts are);
 * the agent mirrors the user's language when it answers. Takes the setup
 * chat's own activity id so the agent can link the routine back to it, and
 * the user's connected providers so it never pins an unconnected one.
 */
export function routineSetupPrompt(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return `Houston sent this message automatically: the user clicked "New routine". The routine form just opened next to this chat, empty, and this chat is where you help them set it up. The user has not said anything yet and is waiting for you to start.

Your job in this conversation: guide the user through creating ONE new Routine, then create it. This chat stays attached to the routine forever — the user can come back to it any time to change the routine.

Start RIGHT NOW, in this same turn:
1. Write exactly one short, friendly opening line (match the user's language; no headings, no lists, no explanations). In that line, say you will help them create this routine and that they can come back to this same chat whenever they want to change it later.
2. Then, still in this turn, call the ask_user tool with your first question: what the routine should do for them. Offer 3 or 4 concrete example options based on what you help this user with (for example "Watch my inbox for anything urgent", "Send me a morning summary of my day", "Remind me before deadlines"), and they can always describe their own idea instead.
Do not stop after the greeting. In this conversation, a turn that ends without an ask_user call is a mistake, until the routine is created.

Interview rules:
- Ask exactly ONE question per ask_user call. Never batch several questions into one call here, even though your general guidance allows up to 3. One question, wait for the answer, then the next.
- Offer answer options whenever the question allows it (schedule choices, yes/no, app choices).
- Keep every message to a couple of short sentences, friendly and non-technical. Never mention files, JSON, schemas, tools, or field names.
- The form next to this chat is live: if the user says they already filled something in there, trust it and skip that question.
- If an earlier answer already covers a later question, skip that question.

What you need to learn, one step at a time:
1. What the routine should do, plus any details you need to do it well.
2. When it should run (how often, and at what time).
3. Which of their connected apps it should use, if the task touches email, calendar, or other apps.
4. Whether every run should add to one ongoing chat, or each run should start a fresh chat.
5. Whether they want to hear about every run, or only when something needs their attention.

Do not ask about models, providers, or other technical settings — the routine uses this agent's settings unless the user brings it up. Propose a short name yourself.

${providerAwareness(connectedProviders)}

When you have everything, summarize the routine in a few plain lines and ask for approval with ask_user (Yes / No). Only create it after a Yes. When you save the routine, set its "setup_activity_id" field to exactly "${activityId}" — that keeps this chat attached to it; never mention this field or any other technical detail to the user. Then confirm it is scheduled and remind them they can change it right here, in this same chat, or in the form next to it, any time.

If the user creates the routine themselves with the form while you are still asking, stop the interview and offer to fine-tune it instead.`;
}

/**
 * The Claude-facing kickoff for a routine that has no chat yet (created with
 * the form, or from before chats were persisted). One calm greeting, no
 * interview — the routine already exists.
 */
export function routineModifyPrompt(
  routine: { id: string; name: string },
  connectedProviders: ConnectedProviderRef[] | null,
): string {
  return `Houston sent this message automatically: the user opened their existing routine "${routine.name}", and this chat just appeared next to the routine's form. This chat stays attached to this routine from now on. The user has not said anything yet.

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
