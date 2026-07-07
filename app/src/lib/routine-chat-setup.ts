/**
 * "Create a routine in chat" — the guided alternative to the routine form.
 *
 * The first chat message reuses the skill-invocation marker
 * (`<!--houston:skill ...-->`, decoded by `@houston-ai/chat`) so the
 * conversation renders a friendly card instead of the raw interview
 * instructions — the exact pattern a Skill run uses. The body after the
 * marker is the Claude-facing prompt. The product prompt's Routines
 * guidance (interview via ask_user, approval, schema-checked save) does
 * the heavy lifting; this prompt kicks it off and covers the choices the
 * form exposes (schedule, one chat vs fresh chats, quiet runs).
 */

import type { SkillInvocation } from "@houston-ai/chat";

const MARKER_PREFIX = "<!--houston:skill ";
const MARKER_SUFFIX = "-->";

/** Fluent 3D emoji slug for the chat card. */
const ROUTINE_SETUP_IMAGE = "alarm-clock";

/**
 * Marker slug for the setup card. Not a real on-disk skill — the chat
 * renderer draws the card purely from the marker payload.
 */
const ROUTINE_SETUP_SLUG = "set-up-a-routine";

export interface RoutineSetupLabels {
  /** Card heading shown in the conversation, e.g. "Set up a routine". */
  title: string;
  /** Card subtitle; also the mission-card preview text. */
  description: string;
}

/**
 * The Claude-facing kickoff. English on purpose (all prompts are); the
 * agent mirrors the user's language when it answers.
 */
export const ROUTINE_SETUP_PROMPT = `The user clicked "New routine" and chose to set it up here in chat. Guide them through creating ONE new Routine, then create it.

Follow your Routines guidance, with these specifics:
- Interview the user with the ask_user tool (batch related questions, at most 3 per call). Cover, in plain language:
  1. What the routine should do, plus any details you need to do it well.
  2. When it should run (how often, and at what time).
  3. Which of their connected apps it should use, if the task touches email, calendar, or other apps.
  4. Whether every run should add to one ongoing chat, or each run should start a fresh chat.
  5. Whether they want to hear about every run, or only when something needs their attention.
- If their answers already cover a point, do not ask it again.
- Propose a short name and a one-line description yourself; let the user adjust them.
- Do not ask about models, providers, or other technical settings. The routine uses this agent's settings.
- Keep the whole conversation friendly and non-technical. Never mention files, JSON, schemas, or field names.

When you have everything, summarize the routine in a few plain lines and ask for approval with ask_user (Yes / No). Only create it after a Yes. Then confirm it is scheduled and mention they can see it, change it, or pause it anytime in this agent's Routines tab.`;

/**
 * Build the full first-message body: marker (for the card) + kickoff
 * prompt (for the model). Labels are localized at send time so the
 * persisted card matches the user's language.
 */
export function encodeRoutineSetupMessage(labels: RoutineSetupLabels): string {
  const payload: SkillInvocation = {
    skill: ROUTINE_SETUP_SLUG,
    displayName: labels.title,
    image: ROUTINE_SETUP_IMAGE,
    description: labels.description,
    integrations: [],
    fields: [],
    message: "",
    attachments: [],
  };
  return `${MARKER_PREFIX}${JSON.stringify(payload)}${MARKER_SUFFIX}\n\n${ROUTINE_SETUP_PROMPT}`;
}
