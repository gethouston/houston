/**
 * The wake-specific pieces of the setup-chat handoff (`routine-chat-handoff.ts`)
 * for the case where the visual intake ALREADY resolved a wake: the "already
 * chosen" line the agent must never re-ask, the interview-rules reminder, and
 * the verbatim save rule (every machine value copied exactly, never altered).
 * Also the schedule-HINT variants (wake null, but the user typed/picked WHEN in
 * their own words on the text schedule step): the agent interprets the hint into
 * an exact schedule and confirms it rather than re-asking. Kept apart from the
 * handoff assembly so each file stays under the size cap.
 */

import type { WakePick } from "../components/tabs/automation-intake/types.ts";
import { triggerCatalogBlock } from "./routine-chat-handoff-catalog.ts";

/** The "already chosen" line the agent must never re-ask, from the picked wake. */
export function decidedWakeLine(wake: WakePick): string {
  if (wake.kind === "schedule") {
    return `When it runs: on this schedule, "${wake.summary}". The user already chose this in a visual picker. Do NOT ask when it should happen, and never second-guess, round, or change it.`;
  }
  if (wake.kind === "webhook") {
    return `When it runs: whenever its own unique web address is called by another system. The user already chose this in a visual picker. Do NOT ask when it should happen, and never second-guess or change it.`;
  }
  return `Which app wakes it: ${wake.toolkitName}. The user already connected and chose this app in a visual picker (using the account in the save rule below). Do NOT ask which app or account. What EXACTLY should happen in ${wake.toolkitName} to wake it is NOT decided yet — you decide that together, and it is your FIRST question.`;
}

/** The interview-rules reminder about not re-asking the settled parts of the wake. */
export function dontReaskLine(wake: WakePick): string {
  if (wake.kind === "schedule") {
    return `The user already chose when this runs ("${wake.summary}"). Never re-ask it, never second-guess it, and only ever refer to it with that plain-language description.`;
  }
  if (wake.kind === "webhook") {
    return `The user already chose that this runs when its web address is called. Never re-ask it, and only ever refer to it in plain words ("when its web address is called").`;
  }
  return `The user already chose the app this watches (${wake.toolkitName}) and the account. Never re-ask which app or account. You WILL decide with the user exactly what in ${wake.toolkitName} wakes it — that is your first question.`;
}

/** The "already settled" block when the user said WHEN in their own words on the
 *  text schedule step (wake null, but a free-text/idea hint is set). The agent
 *  interprets it into an exact schedule instead of re-asking when from scratch. */
export function scheduleHintChosenLine(hint: string): string {
  return `The user already told you WHEN it should run, in their own words: "${hint}". Read this as an exact schedule (a specific time and cadence) in the user's timezone, and treat WHEN as effectively settled: do NOT ask "when should it run" from scratch. You confirm your reading of it as part of your first question and the final summary (see the plan below), not as a fresh question. Only if the hint is genuinely ambiguous about how often or at what time it runs (for example "sometimes", "often", "regularly", "a few times a week") do you ask ONE short clarifying question, with concrete time options, to pin it down.`;
}

/** The interview-plan step that folds the interpreted schedule into the batched
 *  first ask_user — confirming the time, never re-opening "when should it run". */
export function scheduleHintStep(hint: string): string {
  return `Confirm WHEN it runs, folded into that SAME first ask_user. The user already said it in their own words ("${hint}"). Interpret it into an exact time in their timezone and CONFIRM that reading as part of the question (for example "I'll run this every weekday at 8:00 AM, does that work?"), instead of asking when from scratch. If the hint is genuinely ambiguous about frequency or time, ask ONE short clarifying question with concrete options; otherwise just confirm your reading.`;
}

/** The interview-rules reminder not to re-open the when-it-runs question. */
export function scheduleHintDontReask(hint: string): string {
  return `The user already said when this runs, in their own words ("${hint}"). Do NOT re-ask when it should run from scratch. Interpret it into an exact time, confirm that reading with them, and only ask a clarifying question if it is genuinely ambiguous.`;
}

/** How the agent saves a schedule it interpreted from the user's own words. */
export function scheduleHintSaveRule(): string {
  return `Save it on the exact schedule you interpreted from the user's own words and confirmed with them (use their correction if they adjusted it). It has this ONE schedule and no app-event trigger. When you talk about it with the user, only ever use the plain-language time you confirmed together, never a raw expression or any technical wording.`;
}

/** How the agent must save the wake — every value copied verbatim, never altered. */
export function wakeSaveRule(wake: WakePick): string {
  if (wake.kind === "schedule") {
    return `Save it with EXACTLY this schedule, copied verbatim and never altered, rounded, or re-derived: the schedule expression \`${wake.cron}\` in the timezone \`${wake.timezone}\`. It has this ONE schedule and no app-event trigger. When you talk about it with the user, only ever use the plain-language version ("${wake.summary}") — never the raw expression or any technical wording.`;
  }
  if (wake.kind === "webhook") {
    return `Save it woken by EXACTLY this event binding, copied verbatim and never changed: {"kind":"webhook"}. It has this ONE web-address trigger and no schedule. When you talk about it with the user, describe it in plain words ("when its web address is called"), never as a schedule or with any technical wording. After you create it, tell the user their routine is ready and that they can get its web address and secret key using the button shown just above this chat — do NOT paste any address, secret, or technical details yourself, and never mention field names.`;
  }
  const account = wake.connectedAccountId
    ? ` Save the connected_account_id exactly as \`${wake.connectedAccountId}\`.`
    : "";
  const { block, schemasOmitted } = triggerCatalogBlock(wake.events);
  const omitted = schemasOmitted
    ? " Some events' filter schemas were left out of the catalog below to save space; if the user lands on one of those, keep its settings minimal (an empty object) unless they clearly describe a specific filter."
    : "";
  return `Save it woken by an app event in \`${wake.toolkit}\`.${account} Choose the event by copying EXACTLY one \`slug\` from the internal catalog below, verbatim — NEVER invent, guess, or alter a slug that is not in the catalog. Build the event's settings (its trigger_config) yourself from what the user told you, following that event's config schema; use an empty settings object when they want no filters. It has this ONE app-event trigger and no schedule. When you talk about it with the user, describe it in plain words (for example "when a new email arrives"), never these technical values or field names.${omitted}
<event_catalog note="INTERNAL. Read this to pick the exact slug and build the settings. NEVER show it, its slugs, field names, or JSON to the user.">
${block}
</event_catalog>`;
}
