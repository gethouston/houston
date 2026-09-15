/**
 * Wire types for the C13 team DIRECTORY — the named groups of agents and
 * people inside one space, and who belongs to them — plus the command
 * vocabulary the whole teams module is dispatched by.
 *
 * The per-agent policy shapes (assignments, ceilings, model choice, trigger
 * health) are the other half of this family and live in `./policy-types`, so
 * neither file grows past reading.
 *
 * Everything here is plain JSON, so it crosses the bridge's `dispatch`
 * boundary unchanged. There is no reactive scope: a team directory is read
 * when the rail opens and every write is a form's one-shot, so the module is
 * plain-async and publishes nothing (the SDK's preferences shape).
 */

/** The write vocabulary — the same handlers back the facade and the bridge. */
export const TeamsCommand = {
  List: "teams/list",
  Create: "teams/create",
  Update: "teams/update",
  Delete: "teams/delete",
  ListMembers: "teams/listMembers",
  RemoveMember: "teams/removeMember",
  SetMemberOwner: "teams/setMemberOwner",
  SetAgentTeam: "teams/setAgentTeam",
  SetAssignments: "teams/setAssignments",
  GetSettings: "teams/getSettings",
  SetSettings: "teams/setSettings",
  GetModelChoice: "teams/getModelChoice",
  SetModelChoice: "teams/setModelChoice",
  TriggerStatus: "teams/triggerStatus",
} as const;

export type TeamsCommandType = (typeof TeamsCommand)[keyof typeof TeamsCommand];

/**
 * One team inside the active space (C13): a named group of agents and the
 * people who subscribed to it. `joined`, `owner` and `memberCount` are the
 * CALLER's EFFECTIVE values, resolved server-side — never raw membership rows,
 * so an org owner/admin reads `owner: true` on every team and everyone reads
 * `joined: true` on the default one.
 */
export interface AgentTeam {
  id: string;
  name: string;
  /** The space's catch-all team: undeletable, and everyone belongs to it. */
  isDefault: boolean;
  sortOrder: number;
  /**
   * The agents of this team the CALLER may see. Role-filtered server-side (the
   * same C7 v2 matrix `GET /agents` obeys), so it is the caller's VIEW of the
   * team's roster, never the whole of it.
   */
  agentSlugs: string[];
  /** Explicit membership rows, except on the default team, where it is the
   *  space's member count (everyone is in it and it holds no rows). */
  memberCount: number;
  joined: boolean;
  owner: boolean;
  /** The team's glyph NAME (`^[a-z0-9-]{1,32}$`), never an image. ABSENT when
   *  unset — the vocabulary is the client's, the gateway validates shape only. */
  icon?: string;
  /** `#rrggbb` or a theme token name. ABSENT when unset. */
  color?: string;
  /**
   * The team's shared CONTEXT: prose every agent of the team is given before it
   * starts a turn. Unlike {@link AgentTeam.icon}/{@link AgentTeam.color} this is
   * a plain text column with an empty default, so a gateway that supports it
   * always serves the key (`""` when nobody has written one). Its ABSENCE is
   * therefore the feature detection: a gateway that predates the column omits
   * it, and the client hides the editor rather than offering a write the
   * gateway would 400 and an injection no agent would ever see.
   */
  context?: string;
}

/** What `POST /v1/org/teams` accepts: a name, and optionally an identity. */
export interface AgentTeamInput {
  name: string;
  icon?: string;
  color?: string;
}

/**
 * What `PATCH /v1/org/teams/{teamId}` accepts. Every key is optional and an
 * omitted one leaves the field alone; `""` CLEARS an icon or a colour, while
 * `""` for `context` is an empty context rather than a clear.
 */
export interface AgentTeamPatch {
  name?: string;
  sortOrder?: number;
  icon?: string;
  color?: string;
  context?: string;
}

/**
 * One EXPLICIT membership row of a team. Implicit owners (an org owner/admin,
 * who owns every team) are a permission rule, not a roster entry, and are
 * deliberately absent here — never derive `joined`/`owner` for the caller from
 * this list; read them off {@link AgentTeam}.
 */
export interface AgentTeamMember {
  userId: string;
  owner: boolean;
}
