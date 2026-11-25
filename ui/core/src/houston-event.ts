import type { ClaudeInstallError } from "./types";

/**
 * Events emitted from the Rust backend via houston-tauri.
 *
 * Mirrors the Rust `HoustonEvent` enum in `houston-tauri/src/events.rs`.
 * Apps can extend this with app-specific event types.
 */
export type HoustonEvent =
  | {
      type: "FeedItem";
      data: {
        agent_path: string;
        session_key: string;
        item: { feed_type: string; data: unknown };
      };
    }
  | {
      type: "SessionStatus";
      data: {
        agent_path: string;
        session_key: string;
        status: string;
        error: string | null;
        error_class?: string;
        origin?: string;
        stop_reason?: "turn_time_limit" | "turn_time_limit_unsaved";
      };
    }
  | {
      type: "IssueStatusChanged";
      data: { issue_id: string; status: string };
    }
  | {
      type: "IssueOutputFilesChanged";
      data: { issue_id: string; files: string[] };
    }
  | {
      type: "IssueTitleChanged";
      data: { issue_id: string; title: string };
    }
  | {
      type: "IssuesChanged";
      data: { project_id: string };
    }
  | {
      type: "Toast";
      data: { message: string; variant: string };
    }
  | {
      type: "AuthRequired";
      data: { provider: string; message: string };
    }
  | {
      type: "CompletionToast";
      data: { title: string; issue_id: string | null };
    }
  | {
      type: "EventReceived";
      data: {
        event_id: string;
        event_type: string;
        source_channel: string;
        source_identifier: string;
        summary: string;
      };
    }
  | {
      type: "EventProcessed";
      data: { event_id: string; status: string };
    }
  | { type: "HeartbeatDelivered"; data: { agent_path: string } }
  | { type: "HeartbeatChanged"; data: { workspace_id: string } }
  | { type: "PreferencesChanged"; data: { workspace_id: string } }
  | {
      type: "HeartbeatFired";
      data: { prompt: string; project_id: string | null };
    }
  | {
      type: "CronFired";
      data: { job_id: string; job_name: string; prompt: string };
    }
  | {
      type: "RoutinesChanged";
      data: { agent_path: string };
    }
  | {
      type: "RoutineRunsChanged";
      data: { agent_path: string };
    }
  | {
      type: "ConversationsChanged";
      data: { project_id: string; agent_path: string };
    }
  | {
      type: "ActivityChanged";
      data: { agent_path: string };
    }
  | {
      type: "SkillsChanged";
      data: { agent_path: string };
    }
  | {
      type: "SharedSkillsChanged";
      data: { workspace_id: string };
    }
  | {
      type: "FilesChanged";
      data: { agent_path: string };
    }
  | {
      type: "ConfigChanged";
      data: { agent_path: string };
    }
  | {
      type: "ContextChanged";
      data: { agent_path: string };
    }
  | {
      type: "AgentRoleChanged";
      data: { agent_path: string };
    }
  | {
      type: "LearningsChanged";
      data: { agent_path: string };
    }
  | {
      type: "AgentsChanged";
      data: { workspace_id: string };
    }
  | {
      type: "SidebarLayoutChanged";
      data: { workspace_id: string };
    }
  | {
      type: "ComposioCliReady";
      data: Record<string, never>;
    }
  | {
      type: "ComposioCliFailed";
      data: { message: string };
    }
  | {
      type: "ComposioConnectionAdded";
      data: { toolkit: string };
    }
  | {
      type: "ClaudeCliInstalling";
      data: { progress_pct: number };
    }
  | {
      type: "ClaudeCliReady";
      data: Record<string, never>;
    }
  | {
      type: "ClaudeCliFailed";
      data: { error: ClaudeInstallError };
    }
  | {
      type: "ProviderLoginUrl";
      data: {
        provider: string;
        url: string;
        user_code: string | null;
        auth_code?: boolean;
        instructions?: string;
      };
    }
  | {
      type: "ProviderLoginComplete";
      data: { provider: string; success: boolean; error: string | null };
    }
  | { type: "CustomIntegrationsChanged" }
  | { type: "EventStreamReconnected" };
