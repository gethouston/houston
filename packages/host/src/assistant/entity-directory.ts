import type { ReachableAgent } from "../routes/reachable-agents";

export interface EntityDirectory {
  agents(): Promise<readonly ReachableAgent[]>;
  workspaces(): Promise<readonly NamedEntity[]>;
  members(): Promise<readonly MemberEntity[]>;
  invites(): Promise<readonly InviteEntity[]>;
  routines(agentId: string): Promise<readonly NamedEntity[]>;
  skills(agentId: string): Promise<readonly SlugEntity[]>;
  sharedSkills(workspaceId: string): Promise<readonly SlugEntity[]>;
  activities(agentId: string): Promise<readonly ActivityEntity[]>;
}

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
