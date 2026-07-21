/**
 * The intake's example routines — pure, i18n-keyed, and DOM-free so the
 * node:test suite can drive resolution. Each template's name / description /
 * intent copy lives under `intake.templates.<id>.*` in the routines namespace;
 * this module owns only the STRUCTURE (the cron, and whether it needs event
 * triggers) plus the wake resolution.
 *
 * A schedule template resolves to a {@link SchedulePick} whose plain-language
 * `summary` is built with the SAME `cronSummary` utility the schedule card uses
 * — injected as `buildSummary` so this module stays free of the (React-bearing)
 * `@houston-ai/routines` package and remains node:test-friendly. A template with
 * no cron (inbox triage) resolves the wake to `null`: the AI interviews for it,
 * guided by the template's intent ("when a new email arrives…").
 */
import type { WakePick } from "./types";

export interface IntakeTemplate {
  /** Stable id; also the i18n key segment (`intake.templates.<id>.*`). */
  id: string;
  /** The default schedule for a time-based template; omitted when the wake is
   *  left to the AI (an app-event template). */
  cron?: string;
  /** Offered only where the deployment supports event triggers. */
  requiresTriggers?: boolean;
}

/** The five example routines, in display order. */
export const INTAKE_TEMPLATES: IntakeTemplate[] = [
  { id: "morningBriefing", cron: "0 7 * * 1-5" },
  { id: "weeklyReview", cron: "0 16 * * 5" },
  { id: "deadlineReminders", cron: "0 9 * * *" },
  { id: "inboxTriage", requiresTriggers: true },
  { id: "newsDigest", cron: "0 8 * * *" },
];

/** The templates offered on this deployment (drops the app-event template when
 *  event triggers are unavailable). */
export function availableTemplates(
  triggersAvailable: boolean,
): IntakeTemplate[] {
  return INTAKE_TEMPLATES.filter(
    (t) => !t.requiresTriggers || triggersAvailable,
  );
}

/**
 * Resolve a template's wake. A cron template becomes a {@link SchedulePick} in
 * the account timezone, its summary built by the caller-supplied `buildSummary`
 * (the schedule card's own `cronSummary` binding). A cron-less template resolves
 * to `null` — the AI interviews for the wake.
 */
export function resolveTemplateWake(
  template: IntakeTemplate,
  accountTimezone: string,
  buildSummary: (cron: string) => string,
): WakePick | null {
  if (!template.cron) return null;
  return {
    kind: "schedule",
    cron: template.cron,
    timezone: accountTimezone,
    summary: buildSummary(template.cron),
  };
}
