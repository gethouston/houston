import type { MissionStarter, TurnMode } from "@houston/protocol";
import type { PendingInteraction } from "./interactions";

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  updated_at?: string;
  last_message_at?: string;
  provider?: string;
  model?: string;
  mode?: TurnMode;
  origin_session_key?: string;
  origin_agent?: string;
  started_by?: MissionStarter;
  pending_interaction?: PendingInteraction;
  created_by?: string;
  contributors?: { user_id: string; name?: string }[];
  mentioned?: { user_id: string; at: string; by?: string }[];
}

export type ActivityStatus =
  | "running"
  | "needs_you"
  | "done"
  | "error"
  | "archived";

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: ActivityStatus;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  provider?: string | null;
  model?: string | null;
  mode?: TurnMode;
  pending_interaction?: PendingInteraction | null;
}

export interface NewActivity {
  id?: string;
  title: string;
  description?: string;
  agent?: string;
  provider?: string;
  model?: string;
  mode?: TurnMode;
}

export interface ConversationEntry {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: string;
  session_key: string;
  updated_at?: string;
  last_message_at?: string;
  agent_path: string;
  agent_name: string;
  agent?: string;
  routine_id?: string;
  provider?: string;
  model?: string;
  mode?: TurnMode;
  origin_session_key?: string;
  origin_agent?: string;
  started_by?: MissionStarter;
  created_by?: string;
  contributors?: { user_id: string; name?: string }[];
  mentioned?: { user_id: string; at: string; by?: string }[];
}

export interface AllConversationsResult {
  conversations: ConversationEntry[];
  failedAgents: FailedAgentRead[];
}

export interface FailedAgentRead {
  agentPath: string;
  reason: unknown;
}
