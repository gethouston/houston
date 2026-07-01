// Generic event types — no app-specific coupling.

export type EventType =
  | "message"
  | "heartbeat"
  | "cron"
  | "hook"
  | "webhook"
  | "agent_message";

export type EventStatus =
  | "pending"
  | "processing"
  | "completed"
  | "suppressed"
  | "error";

export interface EventSource {
  channel: string; // "slack", "telegram", "desktop", "system", "webhook", "agent"
  identifier: string; // channel ID, cron job name, etc.
}

export interface EventEntry {
  id: string;
  type: EventType;
  source: EventSource;
  summary: string; // human-readable description
  status: EventStatus;
  payload?: Record<string, unknown>;
  sessionKey?: string;
  projectId?: string;
  createdAt: string; // ISO 8601
  processedAt?: string;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  message: "Message",
  heartbeat: "Heartbeat",
  cron: "Scheduled",
  hook: "Hook",
  webhook: "Webhook",
  agent_message: "Agent",
};

export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  message: "MessageSquare",
  heartbeat: "Heart",
  cron: "Clock",
  hook: "Zap",
  webhook: "Globe",
  agent_message: "Bot",
};
