import type {
  ConversationEntry,
  FailedAgentRead,
} from "@houston/engine-adapter";
import type { MissionStarter } from "@houston/protocol";
import {
  isStaleRosterReadError,
  partitionStaleRosterReads,
} from "./agent-gone";
import { isAgentPathCreating } from "./agent-warming-guard";
import { getEngine } from "./engine";
import { logger } from "./logger";
import { healStaleRosterFromError } from "./roster-heal";
import {
  engineCall as call,
  type EngineCallOptions,
  passiveAgentRead,
} from "./tauri";

export interface RawConversation {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: "primary" | "activity";
  session_key: string;
  updated_at?: string;
  last_message_at?: string;
  agent_path: string;
  agent_name: string;
  agent?: string;
  routine_id?: string;
  origin_session_key?: string;
  origin_agent?: string;
  started_by?: MissionStarter;
  created_by?: string;
  contributors?: { user_id: string; name?: string }[];
  mentioned?: { user_id: string; at: string; by?: string }[];
}

export interface AllConversationsSweep {
  items: RawConversation[];
  failedAgents: FailedAgentRead[];
}

export const tauriConversations = {
  list: (agentPath: string) =>
    isAgentPathCreating(agentPath)
      ? Promise.resolve<RawConversation[]>([])
      : passiveAgentRead<RawConversation[]>("list_conversations", async () =>
          (await getEngine().listConversations(agentPath)).map(
            conversationToRaw,
          ),
        ),
  listAll: (
    agentPaths: string[],
    options?: EngineCallOptions,
    signal?: AbortSignal,
  ) => {
    const reachable = agentPaths.filter((p) => !isAgentPathCreating(p));
    if (reachable.length === 0)
      return Promise.resolve<AllConversationsSweep>({
        items: [],
        failedAgents: [],
      });
    return call<AllConversationsSweep>(
      "list_all_conversations",
      async () => {
        const { conversations, failedAgents } =
          await getEngine().listAllConversations(reachable, { signal });
        const { stale, failed } = partitionStaleRosterReads(failedAgents);
        if (stale.length > 0) {
          logger.warn(
            `[engine:list_all_conversations] ${stale.length} agent(s) gone from the roster or not readable by this viewer: ${stale
              .map((g) => `${g.agentPath} (${String(g.reason)})`)
              .join(", ")}`,
          );
          healStaleRosterFromError(stale[0].reason);
        }
        return {
          items: conversations.map(conversationToRaw),
          failedAgents: failed,
        };
      },
      undefined,
      { silence: isStaleRosterReadError, ...options },
    ).catch((err) => {
      healStaleRosterFromError(err);
      throw err;
    });
  },
};

function conversationToRaw(c: ConversationEntry): RawConversation {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: c.status,
    type: c.type as "primary" | "activity",
    session_key: c.session_key,
    updated_at: c.updated_at,
    last_message_at: c.last_message_at,
    agent_path: c.agent_path,
    agent_name: c.agent_name,
    agent: c.agent,
    routine_id: c.routine_id,
    origin_session_key: c.origin_session_key,
    origin_agent: c.origin_agent,
    started_by: c.started_by,
    created_by: c.created_by,
    contributors: c.contributors,
    mentioned: c.mentioned,
  };
}
