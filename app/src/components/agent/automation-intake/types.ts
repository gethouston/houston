import type { Agent } from "../../../lib/types";

export type SchedulePick = {
  kind: "schedule";
  cron: string;
  timezone: string;
  summary: string;
};

export interface TriggerEventOption {
  slug: string;
  name: string;
  description?: string;
  configSchema?: unknown;
}

export interface TriggerPick {
  kind: "trigger";
  toolkit: string;
  toolkitName: string;
  connectedAccountId?: string;
  events: TriggerEventOption[];
}

export type WebhookPick = {
  kind: "webhook";
};

export type WakePick = SchedulePick | TriggerPick | WebhookPick;

export interface IntakeResult {
  intent: string | null;
  wake: WakePick | null;
  scheduleHint: string | null;
  templateId?: string;
}

export interface AutomationIntakeProps {
  agent: Agent;
  accountTimezone: string;
  triggersAvailable: boolean;
  onComplete: (result: IntakeResult) => void;
  onDismiss: () => void;
}
