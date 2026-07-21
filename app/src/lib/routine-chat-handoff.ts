/**
 * The Claude-facing kickoff for an automation's setup chat AFTER the visual
 * intake (`components/tabs/automation-intake`) collected what the user gave up
 * front: at most an INTENT (what they want it to do, in their own words) and a
 * WAKE (a cron schedule, an incoming webhook, or an app the trigger watches).
 * Either can be absent — the user may have skipped straight to the AI, or picked
 * only a wake, or only a template intent. This kickoff hands the agent whatever
 * was settled (verbatim machine values it must save exactly and never re-ask)
 * and interviews for the rest.
 *
 * It is the intake sibling of `routineSetupPrompt` in `routine-chat-prompts.ts`
 * (same tone, interview rules, provider awareness, and `setup_activity_id`
 * stamping); the difference is the "already chosen" block and the verbatim save
 * rule. For an app trigger the intake picked ONLY the app (and account); WHICH
 * event on it, and its filters, are decided here, in plain words, guided by the
 * app's event catalog embedded as an internal machine block. Like every setup
 * kickoff it rides the auto-continue marker so the user never sees a fake bubble.
 */

import type { WakePick } from "../components/tabs/automation-intake/types.ts";
import { encodeAutoContinueMessage } from "./auto-continue-message.ts";
import { aiWakeSaveRule, interviewPlan } from "./routine-chat-handoff-plan.ts";
import {
  decidedWakeLine,
  dontReaskLine,
  scheduleHintChosenLine,
  scheduleHintDontReask,
  scheduleHintSaveRule,
  wakeSaveRule,
} from "./routine-chat-handoff-wake.ts";
import {
  type ConnectedProviderRef,
  providerAwareness,
} from "./setup-chat-prompt-shared.ts";

/** Everything the intake settled before the model was called. */
export interface RoutineIntake {
  /** The user's own description of what it should do, or null (they gave none —
   *  the agent opens by asking what it should do). */
  intent: string | null;
  /** The already-chosen wake, or null (the agent interviews for the wake, unless
   *  a `scheduleHint` narrows it to a schedule). */
  wake: WakePick | null;
  /** When the user said WHEN it runs in their OWN WORDS on the text schedule step
   *  ("every weekday morning", "every second Tuesday at 3pm"): the agent
   *  interprets it into an exact schedule and confirms it rather than re-asking.
   *  Only ever set when `wake` is null; null on every other path. */
  scheduleHint: string | null;
}

/**
 * The intake handoff kickoff. Takes the setup chat's own activity id (the agent
 * stamps it into the routine's `setup_activity_id`), the user's connected
 * providers (so it never pins an unconnected one), and the intake result (the
 * intent and/or wake the visual cards resolved — either may be null).
 */
export function routineIntakeHandoffPrompt(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
  intake: RoutineIntake,
): string {
  const { wake } = intake;
  const intent = intake.intent?.trim() ? intake.intent.trim() : null;
  // A schedule hint only ever applies when no exact wake was picked.
  const scheduleHint =
    wake === null && intake.scheduleHint?.trim()
      ? intake.scheduleHint.trim()
      : null;

  const chosenBlock = wake
    ? `Already chosen in the picker (never re-ask this):\n- ${decidedWakeLine(wake)}`
    : scheduleHint
      ? `Already settled in their own words (never re-ask this):\n- ${scheduleHintChosenLine(scheduleHint)}`
      : `The user did not choose when it runs yet — you decide that together with them (see the plan below).`;

  const intentBlock = intent
    ? `\n\nThe user already described, in their own words, what they want this to do:\n"${intent}"\nTreat this as their intent. Confirm it and tailor the details with them; do NOT ask them what it should do from scratch, and never second-guess the core idea.`
    : "";

  const dontReask = wake
    ? `\n- ${dontReaskLine(wake)}`
    : scheduleHint
      ? `\n- ${scheduleHintDontReask(scheduleHint)}`
      : "";
  const saveRule = wake
    ? wakeSaveRule(wake)
    : scheduleHint
      ? scheduleHintSaveRule()
      : aiWakeSaveRule();

  return `Houston sent this message automatically: the user just started a new routine${wake ? " and already chose, in a visual picker, WHEN it runs" : ""}. This chat is where you finish setting it up and create it. It stays attached to the routine forever — the user can come back any time to change it. The user has not typed anything here yet and is waiting for you to start.

Your job in this conversation: finish this ONE routine with the user, then create it. A routine is work you do for the user without them asking each time.

${chosenBlock}${intentBlock}

Start RIGHT NOW, in this same turn, with a SINGLE ask_user call — no preamble, and do not spend a separate turn on a greeting first (every turn costs the user real money, so get straight to the point). Fold a brief, friendly framing INTO that first question (match the user's language): let them know you'll finish setting this up with them and they can always come back to this same chat to change it later, then ask the FIRST thing below. A turn that ends without an ask_user call is a mistake, until the routine is created.

Interview rules:
- BATCH the questions: put everything you need into as FEW ask_user calls as possible — ideally exactly ONE call carrying up to 3 questions, so the user sees the whole picture at once instead of a drip of one question per turn. Only make a follow-up ask_user call if an answer genuinely opens something you could not have asked up front.
- Offer answer options for every question that allows it (app choices, schedule choices, yes/no).
- Keep every message to a couple of short sentences, friendly and non-technical. Never mention files, JSON, schemas, tools, or field names.
- If an answer already covers another question, drop that question.${dontReask}
- If you have more topics than fit in one call, fold the small preference questions together and prefer sensible defaults over extra rounds.

What you need to learn (batch these into that first call wherever possible):
${interviewPlan(wake, intent, scheduleHint)}

Do not ask about models, providers, or other technical settings — the routine uses this agent's settings unless the user brings it up. Propose a short name yourself.

${providerAwareness(connectedProviders)}

When you have everything, summarize the routine in a few plain lines (what wakes it, and what it does) and ask for approval with ask_user (Yes / No). Only create it after a Yes. ${saveRule} Set its "setup_activity_id" field to exactly "${activityId}" — that keeps this chat attached to it; never mention this field or any other technical detail to the user. Then confirm it is set up and remind them they can change it right here, in this same chat, any time.`;
}

/** The full first-message body for an intake-seeded new-automation chat: marker
 *  (hides the bubble) + the handoff kickoff. */
export function encodeRoutineIntakeHandoffMessage(
  activityId: string,
  connectedProviders: ConnectedProviderRef[] | null,
  intake: RoutineIntake,
): string {
  return encodeAutoContinueMessage(
    routineIntakeHandoffPrompt(activityId, connectedProviders, intake),
  );
}
