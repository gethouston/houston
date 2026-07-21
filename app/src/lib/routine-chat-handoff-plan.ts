/**
 * The numbered "what you need to learn" interview plan the intake handoff
 * (`routine-chat-handoff.ts`) assembles from the intake result: the FIRST-ask
 * (what it should do, or what wakes an app trigger), the wake interview (only for
 * a fully undecided wake) or the schedule-hint confirmation (when the user typed
 * WHEN in their own words), and the shared tail. Split out so the assembly file
 * stays under the size cap.
 */

import type { WakePick } from "../components/tabs/automation-intake/types.ts";
import { eventNameExamples } from "./routine-chat-handoff-catalog.ts";
import { scheduleHintStep } from "./routine-chat-handoff-wake.ts";

/** Plain-language example first-asks for "what should it do", tuned to the wake
 *  (or its absence). A schedule hint means it is time-based, so it draws the same
 *  recurring examples as a chosen schedule; an undecided wake with no hint
 *  includes an app-event example. */
function purposeExamples(
  wake: WakePick | null,
  scheduleHint: string | null,
): string {
  if (wake?.kind === "schedule" || (wake === null && scheduleHint)) {
    return `recurring things like "Send me a morning summary of my day", "Remind me before my deadlines", or "Give me a weekly recap of what happened"`;
  }
  if (wake === null) {
    return `things like "Send me a morning summary of my day", "Remind me before deadlines", or "When a new email arrives, summarize it for me"`;
  }
  return `reactions to being called like "Process whatever was sent to me", "Notify me on Slack about it", or "Save the details somewhere I can find them"`;
}

/** The FIRST-question step for a schedule/webhook/undecided wake: ask what it
 *  should do, unless the user already described it (then confirm and tailor). */
function purposeStep(
  wake: WakePick | null,
  intent: string | null,
  scheduleHint: string | null,
): string {
  if (intent) {
    return `Confirm and refine what they described ("${intent}"). This is your FIRST question, and it must be a single ask_user call. Do NOT ask them what it should do from scratch — check any details you still need to do it well, and offer sensible options where you can.`;
  }
  return `What the routine should do. This is your FIRST question, and it must be a single ask_user call. Offer 3 or 4 concrete example options that fit ${purposeExamples(wake, scheduleHint)} — and let them know they can always describe their own idea instead. Gather any details you still need to do it well.`;
}

/** The wake-interview step, added only when no wake was chosen. Same two-way
 *  plain-language guidance as `routineSetupPrompt`'s wakeGuidance. */
function wakeInterviewStep(): string {
  return `When it should happen. There are two ways a routine wakes, and the user picks in plain words: on a schedule (how often, and at what time), OR the moment something happens in one of their connected apps (a new email arrives, a message is posted, a file changes). If they choose an app event, learn which connected app it lives in and exactly which event should wake it — it MUST be an app they have actually connected; if the app they want is not connected, help them connect it first. Also ask about any filters that narrow WHEN it fires, if they want them.`;
}

/** The numbered "what you need to learn" plan, assembled for this intake. A
 *  chosen app trigger opens on WHAT in the app wakes it; every other case opens
 *  on what it should do (or confirming the described intent). A fully undecided
 *  wake inserts the wake interview; a schedule hint inserts the confirm-the-time
 *  step instead. The tail (apps, chat mode, notifications) is shared. */
export function interviewPlan(
  wake: WakePick | null,
  intent: string | null,
  scheduleHint: string | null,
): string {
  const steps: string[] = [];
  if (wake?.kind === "trigger") {
    steps.push(
      `What should happen in ${wake.toolkitName} to wake this routine. This is your FIRST question, and it must be a single ask_user call. Offer 3 or 4 concrete example options like ${eventNameExamples(wake.events)} — and let them know they can describe it in their own words instead. Use their answer to choose the matching event from the internal catalog in the save rule below.`,
    );
    steps.push(
      intent
        ? `Confirm the work they described ("${intent}") and tailor any details you still need. Do NOT re-ask what it should do.`
        : `What the routine should do each time that happens. Offer a couple of concrete examples like "Summarize it for me", "Notify me on Slack about it", or "Save the important details somewhere I can find them", and let them describe their own. Gather any details you still need to do it well.`,
    );
  } else {
    steps.push(purposeStep(wake, intent, scheduleHint));
    // Only interview for the wake when it is fully undecided; a schedule hint
    // means the user already said WHEN, so the agent confirms it instead.
    if (wake === null && scheduleHint) {
      steps.push(scheduleHintStep(scheduleHint));
    } else if (wake === null) {
      steps.push(wakeInterviewStep());
    }
  }
  steps.push(
    `Which of their connected apps it should use, if the task touches email, calendar, or other apps.`,
  );
  steps.push(
    `Whether every run should add to one ongoing chat, or each run should start a fresh chat.`,
  );
  steps.push(
    `Whether they want to hear about every run, or only when something needs their attention.`,
  );
  return steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

/** How the agent saves an UNDECIDED wake once the interview settles it. Same
 *  one-wake-mechanism rule as `routineSetupPrompt`. */
export function aiWakeSaveRule(): string {
  return `Save it as a routine with exactly ONE wake mechanism, matching what the user chose: either the agreed schedule (and no trigger), or a trigger naming the chosen app, event, and any filters (and no schedule).`;
}
