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
  channel: string;
  identifier: string;
}

export interface EventEntry {
  id: string;
  type: EventType;
  source: EventSource;
  summary: string;
  status: EventStatus;
  payload?: Record<string, unknown>;
  sessionKey?: string;
  projectId?: string;
  createdAt: string;
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
