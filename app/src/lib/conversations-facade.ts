/**
 * Conversation reads as the app reaches them: one agent's conversations and
 * the cross-agent sweep that feeds Mission Control, each wrapped in the same
 * error-surfacing policy every other engine call gets.
 *
 * Part of `./tauri` rather than a layer of its own, in its own file for the
 * reason `./agents-facade` is: it reaches the engine through `getEngine()` and
 * its failures through `engineCall` / `passiveAgentRead`
 * (`scripts/check-boundaries.mjs` rule D names this file for that reason).
 */

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
  /** The conversation this mission was started from, present only when the
   *  agent created the mission itself (PRODUCT-1244). Server-stamped. */
  origin_session_key?: string;
  origin_agent?: string;
  /** Which AI started this mission (PRODUCT-1928). Server-stamped at
   *  creation; absent on a person's mission and on older rows. */
  started_by?: MissionStarter;
  /** The human who created this mission (Teams attribution). Server-stamped
   *  from the gateway acting-as identity; absent on desktop/single-player. */
  created_by?: string;
  /** Humans who started or collaborated on this mission (Teams attribution).
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  contributors?: { user_id: string; name?: string }[];
  /** Teammates @mentioned in this mission's chat, latest per person.
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  mentioned?: { user_id: string; at: string; by?: string }[];
}

/**
 * One cross-agent conversation sweep: the rows every agent that answered
 * returned, plus the agents whose read failed — each carrying the error it
 * failed WITH, so the recovery layer can classify the surface. A non-empty
 * `failedAgents` means the rows are INCOMPLETE and must not be treated as the
 * whole truth (see lib/all-conversations-recovery.ts).
 */
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
  /** @param options pass `{ surface: false }` for an attempt the caller will
   *  retry — the failure it surfaces is the LAST one, exactly once. */
  listAll: (
    agentPaths: string[],
    options?: EngineCallOptions,
    signal?: AbortSignal,
  ) => {
    // A JUST-CREATED agent has no conversations yet and its read would hold
    // the whole bulk scan — sweep only past those. An EXISTING asleep agent
    // stays IN the sweep: dropping it resolves Mission Control without its
    // missions (a successful partial list that overwrites the restored cache);
    // keeping it holds the sweep until its pod wakes while the cached rows
    // keep painting.
    const reachable = agentPaths.filter((p) => !isAgentPathCreating(p));
    if (reachable.length === 0)
      return Promise.resolve<AllConversationsSweep>({
        items: [],
        failedAgents: [],
      });
    // A sweep where SOME agents failed resolves (partial) rather than throwing,
    // so `call()` raises no toast for it — the query layer owns that surface
    // (one toast per incomplete sweep, plus a bounded re-sweep). Only a sweep
    // where EVERY agent failed rejects, and that keeps the toast + capture.
    //
    // A PASSIVE read like every other roster-driven one (`passiveAgentRead`):
    // an agent the server no longer knows (`404 agent not found` — the local
    // roster is stale after a space switch or a delete on another device) or
    // one this viewer may not read (`403 not allowed` — unassigned on another
    // device, HOUSTON-APP-5AV / 5AT) is not a failed read of OUR agent. The
    // error is silenced and the roster heals; in a partial sweep the stale
    // agents leave `failedAgents` (nothing to re-sweep, nothing to report —
    // HOUSTON-APP-4WR / 58R / 55E), and a sweep where EVERY agent is stale
    // rejects quietly (the caller's surface silences it too) so the cache
    // keeps the last real rows for the roster reload that follows. Every
    // real failure keeps its loud path.
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
