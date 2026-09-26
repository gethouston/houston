import type { ReachableAgent } from "../routes/reachable-agents";

/**
 * Everything the assistant dispatcher can name by identity, listed LIVE for
 * the acting user in the deployment this host runs in: the local store when
 * this host is its own gateway, the gateway's own list routes on a managed
 * pod (whose store holds only the assistant). Entity resolution
 * (`entity-resolution.ts`) turns a spoken name or a guessed id into the real
 * id against these lists and, on refusal, lists what exists, so the model
 * never has to guess. The dispatcher builds one directory per call
 * (`routes/assistant-operation-ctx.ts`); the lists are read lazily, only
 * when an operation actually names that kind of thing.
 */
export interface EntityDirectory {
  /** Agents the acting user may address, never the assistant itself. */
  agents(): Promise<readonly ReachableAgent[]>;
  /** Workspaces (spaces) the acting user belongs to. */
  workspaces(): Promise<readonly NamedEntity[]>;
  /** People in the active org, by user id. */
  members(): Promise<readonly MemberEntity[]>;
  /** Pending org invites. */
  invites(): Promise<readonly InviteEntity[]>;
  /** Routines owned by one agent (already-resolved agent id). */
  routines(agentId: string): Promise<readonly NamedEntity[]>;
  /** Skills owned by one agent, by slug. */
  skills(agentId: string): Promise<readonly SlugEntity[]>;
  /** Shared skills of one workspace, by slug. */
  sharedSkills(workspaceId: string): Promise<readonly SlugEntity[]>;
  /** Missions (activities) on one agent's board. */
  activities(agentId: string): Promise<readonly ActivityEntity[]>;
}

/**
 * A mission, plus the chat it is talked about in.
 *
 * The address is carried HERE because the board is the only place it is
 * written down: a mission's `session_key` is usually the `activity-<id>`
 * convention but does not have to be (a welcome chat, a card created before
 * the key was stored), and a caller holding nothing but a conversation id
 * cannot tell such a chat from one the person started. The protected-chat
 * guard (`routes/assistant-protected-chat.ts`) is that caller.
 */
export interface ActivityEntity extends NamedEntity {
  readonly sessionKey: string;
}

export interface NamedEntity {
  readonly id: string;
  readonly name: string;
}

export interface SlugEntity {
  readonly slug: string;
  readonly name: string;
}

export interface MemberEntity {
  readonly userId: string;
  readonly name: string;
  readonly email?: string;
}

export interface InviteEntity {
  readonly id: string;
  readonly email: string;
}
