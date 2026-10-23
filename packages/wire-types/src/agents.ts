/**
 * Workspace-scoped agent CRUD: the agent record the listing serves and the
 * create / update request and response shapes.
 */

import type { AgentInitialConfig } from "@houston/protocol";
import type { AgentPause, AgentSteward } from "./partner";
import type { AgentAccess, AgentAssignment } from "./types";

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color?: string;
  /**
   * The role the agent's job description names (its `CLAUDE.md` `role`
   * field), served on the listing so a surface names each agent's job without
   * reading every job description. Absent when none is named.
   */
  role?: string;
  createdAt: string;
  lastOpenedAt?: string;
  /**
   * The agent's absolute on-disk directory, reported only when the engine is
   * co-located with the files (TS host, local profile). This is what the
   * desktop shell hands to the OS reveal/open commands — `folderPath` there is
   * a route key, not a path (HOU-677). Absent on cloud and on the legacy Rust
   * engine (whose `folderPath` is already the real path).
   */
  localDir?: string;
  /**
   * Multiplayer only: whether the CURRENT user has been assigned this agent
   * (i.e. may use it). Absent in single-player mode, where every agent is the
   * sole user's. The host computes this per-caller.
   */
  assigned?: boolean;
  /**
   * Multiplayer only: the org-member user ids this agent is assigned to.
   * Empty means "everyone in the org". Absent in single-player mode. Only
   * populated for callers who may manage assignments (owner/admin).
   *
   * Retained for back-compat alongside the richer `assignments` (Teams v2);
   * the two carry the same user set for a manager/owner caller.
   */
  assignedUserIds?: string[];
  /**
   * Teams v2: the CURRENT caller's effective access to this agent —
   * `"manager"` (may reconfigure) or `"user"` (may only use). Owner is always
   * `"manager"`. Absent in single-player mode and on hosts that predate Teams.
   */
  access?: AgentAccess;
  /**
   * Teams v2: the full assignee list with per-person access level. Populated
   * only for callers who may manage the agent (owner, or an admin who is an
   * agent-manager); absent for agents an admin merely uses, and in
   * single-player mode. `assignedUserIds` mirrors these user ids for back-compat.
   */
  assignments?: AgentAssignment[];
  /**
   * Houston Partner: present when the org's partners manage this agent (a
   * partner built it here or moved it in). Its configuration is then theirs:
   * anyone else, the owner included, is refused `partner_managed` on it.
   * Absent means the org's own agent, under the ordinary rules.
   */
  managedBy?: AgentSteward;
  /** Houston Partner: a partner's pause on this agent; null or absent = running. */
  pause?: AgentPause | null;
}

export interface CreateAgent {
  name: string;
  configId: string;
  color?: string;
  claudeMd?: string;
  installedPath?: string;
  seeds?: Record<string, string>;
  existingPath?: string;
  /** The config the agent is born with (a new hire's pending first day). */
  config?: AgentInitialConfig;
  /** Sent only by the desktop-to-cloud move: the create keeps the agent's name
   *  even when it is the AI Manager's reserved one ("Houston"). */
  migration?: boolean;
}

export interface CreateAgentResult {
  agent: Agent;
}

export interface UpdateAgent {
  color: string;
}
