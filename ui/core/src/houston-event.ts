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
      // `user_code` is null for the paste-back flow (Claude): the UI shows a
      // paste-code input. For codex's device-grant flow it carries the
      // one-time code the user enters on the provider's verification page
      // (no paste-back). The relay may emit twice for one device sign-in:
      // first URL-only, then again with the code.
      //
      // `auth_code` is true for the setup-token paste flow (Claude/Anthropic):
      // `url` is only a docs reference, NOT a page to auto-open, and the user
      // finishes by pasting a token. The UI MUST show the paste dialog (never
      // auto-open the URL) — see `shouldOpenLoginUrlDirectly`. `instructions`
      // carries the runtime's step-by-step copy to render above the paste
      // field (absent for the loopback `url` and device-code flows).
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
  // HOU-550: a custom (API / MCP) integration was added, credentialed, or
  // removed. Carries no payload — the whole user-level list is refetched.
  | { type: "CustomIntegrationsChanged" }
  // HOU-981: the global reactivity stream RE-connected after a drop. Not a
  // domain change — a transport fact. Everything that happened while the
  // stream was down was never delivered (the feed has no replay cursor), so
  // the consumer catches up by re-reading. Emitted only on a re-connect, never
  // on the first one: the initial read is already happening.
  | { type: "EventStreamReconnected" };
