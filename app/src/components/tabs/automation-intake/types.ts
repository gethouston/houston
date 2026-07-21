/**
 * The AutomationIntake contract. Clicking "New routine" opens the setup
 * CHAT immediately; AutomationIntake renders the scripted intake cards over it
 * (they look exactly like the agent's real ask_user cards, but run locally with
 * zero model calls). The intake collects — at most — WHAT the user wants (an
 * intent) and WHEN it runs (a {@link WakePick}), then completes with an
 * {@link IntakeResult}. Only then is the model called: the draft chat opens with
 * a handoff carrying everything collected (see `lib/routine-chat-handoff.ts`).
 *
 * These types are the single source of truth: the tab surface (a sibling agent)
 * is built blind against this file, so keep it authoritative.
 */
import type { Agent } from "../../../lib/types";

/** A cron schedule the user built with the schedule pickers. `summary` is the
 *  plain-language line (same wording as the grid) the AI restates to the user. */
export type SchedulePick = {
  kind: "schedule";
  cron: string;
  timezone: string;
  summary: string;
};

/** One event in the picked app's trigger catalog, carried to the setup chat so
 *  the agent can choose the exact event (and its filters) from the conversation.
 *  `configSchema` is the raw JSON schema for that event's instance filters. */
export interface TriggerEventOption {
  slug: string;
  name: string;
  description?: string;
  configSchema?: unknown;
}

/** An app the user picked (and connected, if needed) to wake this automation.
 *  The intake no longer asks WHICH event or its filters — it carries the app's
 *  identity, the pinned account, and the whole event catalog so the AI setup
 *  chat can decide the exact event slug and config in plain words. */
export interface TriggerPick {
  kind: "trigger";
  toolkit: string;
  toolkitName: string;
  connectedAccountId?: string;
  events: TriggerEventOption[];
}

/** An incoming-webhook wake: the automation runs whenever an external system
 *  POSTs to the unique web address minted for it after creation. Carries no
 *  values here — the address and secret are minted (and revealed) later, from
 *  the setup chat header, never in the intake. */
export type WebhookPick = {
  kind: "webhook";
};

/** How the automation wakes. `null` on an {@link IntakeResult} means the user
 *  left it to the AI, which interviews for the wake in chat. */
export type WakePick = SchedulePick | TriggerPick | WebhookPick;

/** Everything the intake collected before the model is called. `intent` null =
 *  the user gave no description (the AI opens by asking what it should do);
 *  `wake` null = the AI interviews for the wake. `scheduleHint` is the WHEN the
 *  user gave in their own words on the text schedule step (the AI interprets it
 *  into an exact schedule); it is only ever set when `wake` is null, and null on
 *  every other path (trigger, webhook, template — templates resolve a concrete
 *  {@link SchedulePick} instead). `templateId` is set only when the user resolved
 *  the intent from a template. */
export interface IntakeResult {
  intent: string | null;
  wake: WakePick | null;
  scheduleHint: string | null;
  templateId?: string;
}

export interface AutomationIntakeProps {
  /** The agent the automation belongs to (scopes connections + triggers). */
  agent: Agent;
  /** Account-wide timezone recorded on a schedule pick. */
  accountTimezone: string;
  /** Whether this deployment supports event triggers (offers the event +
   *  webhook wakes, and the app-event template). */
  triggersAvailable: boolean;
  /** Fires once with the collected result when the intake completes. */
  onComplete: (result: IntakeResult) => void;
  /** The modal X: dismiss the intake, creating nothing (back to the list). */
  onDismiss: () => void;
}
