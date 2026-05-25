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
      type: "LearningsChanged";
      data: { agent_path: string };
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
  // ----- Claude Code CLI lifecycle -----
  // Mirror of houston_ui_events::HoustonEvent::{ClaudeCli*} in Rust.
  // claude-code is proprietary and downloaded at runtime; these events
  // drive the install-progress UI and surface install failures to the
  // user (see app/src/hooks/use-claude-cli-events.ts).
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
      data: { message: string };
    }
  | {
      type: "ProviderLoginUrl";
      data: { provider: string; url: string };
    }
  | {
      type: "ProviderLoginComplete";
      data: { provider: string; success: boolean; error: string | null };
    };
