import type { WakePick } from "./types";

export interface IntakeTemplate {
  id: string;
  cron?: string;
  requiresTriggers?: boolean;
}

export const INTAKE_TEMPLATES: IntakeTemplate[] = [
  { id: "morningBriefing", cron: "0 7 * * 1-5" },
  { id: "weeklyReview", cron: "0 16 * * 5" },
  { id: "deadlineReminders", cron: "0 9 * * *" },
  { id: "inboxTriage", requiresTriggers: true },
  { id: "newsDigest", cron: "0 8 * * *" },
];

export function availableTemplates(
  triggersAvailable: boolean,
): IntakeTemplate[] {
  return INTAKE_TEMPLATES.filter(
    (t) => !t.requiresTriggers || triggersAvailable,
  );
}

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
