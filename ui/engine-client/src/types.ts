/**
 * Wire types mirroring `engine/houston-engine-protocol/src/lib.rs` and
 * domain DTOs from `engine/houston-engine-core`.
 *
 * Until we wire up a Rust→TS code generator (`ts-rs` or `specta`) these
 * are maintained by hand. Keep them in sync — the Rust side is the
 * source of truth.
 */

import type {
  StoreAgentDetail,
  StoreAgentSummary,
} from "@houston/agentstore-client";

export const PROTOCOL_VERSION = 1 as const;

export type EnvelopeKind = "event" | "req" | "res" | "ping" | "pong";

export interface EngineEnvelope<P = unknown> {
  v: number;
  id: string;
  kind: EnvelopeKind;
  ts: number;
  payload: P;
}

export type ClientRequest =
  | { op: "sub"; topics: string[] }
  | { op: "unsub"; topics: string[] };

export interface LagMarker {
  type: "Lag";
  dropped: number;
}

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "VERSION_MISMATCH";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
  protocol: number;
}

export interface VersionResponse {
  engine: string;
  protocol: number;
  build: string | null;
  /**
   * True when this install carried over a legacy Rust-desktop chat-history db,
   * i.e. the user is migrating from the old desktop build. The desktop UI uses
   * this to show its one-time "reconnect your AI" moment, because the migrated
   * provider credentials are not portable. Absent on engines that predate the
   * field (treat as `false`).
   */
  chatHistoryMigrated?: boolean;
}

export interface Capabilities {
  profile: "local" | "cloud";
  revealInOs: boolean;
  terminal: boolean;
  tunnel: boolean;
  codeExecution: "local-bash" | "remote-sandbox" | "disabled";
  providers: string[];
  openaiCompatible: boolean;
  integrations: string[];
  /**
   * Whether this deployment runs in multiplayer (paid org) mode: members,
   * roles, per-agent assignment. Absent/false = single personal workspace.
   * Optional so every existing single-player host/profile stays valid.
   */
  multiplayer?: boolean;
  /** The current user's role in the org, when `multiplayer` is on. */
  role?: OrgRole;
  /**
   * Whether this deployment serves the Teams v2 surface (per-agent access
   * levels, share dialog, org dashboard). A feature-detect flag the frontend
   * reads to enable the v2 UI; absent/false on hosts that predate Teams so
   * every existing single-player/self-host profile stays valid.
   */
  teams?: boolean;
  /**
   * Whether this deployment serves C8 Spaces: self-serve team creation, agent
   * moves between spaces, and the multi-membership space switcher. A feature-
   * detect flag the frontend reads to route the switcher's create action to the
   * Create-team dialog; absent/false on desktop/self-host (the create action
   * stays "create a local workspace"). The gateway is the sole enforcer.
   */
  spaces?: boolean;
  /**
   * Whether this deployment can wake routines on external Composio events (C9
   * event-driven routines). Requires a Composio project key AND a public webhook
   * URL, so it is on for managed cloud + self-host and OFF on desktop (no public
   * URL to deliver to). The UI reads it to show/hide the routine's "wake on an
   * event" option; absent/false on hosts that predate triggers. Feature-detect
   * flag only — the gateway/host is the sole enforcer.
   */
  triggers?: boolean;
  /**
   * Whether this deployment serves the C9 public API, so the user can mint and
   * revoke personal API keys (`GET/POST/DELETE /v1/keys`) to drive their agents
   * from their own tools. A feature-detect flag the frontend reads to show the
   * API-keys settings section; absent/false on desktop/self-host and on gateways
   * that predate the public API. The gateway is the sole enforcer.
   */
  apiKeys?: boolean;
  /**
   * Whether this deployment serves per-agent compute analytics — how long each
   * agent's engine was running (`GET /v1/org/compute-usage`). Gateway-injected,
   * hosted-cloud only; absent/false on desktop/self-host and on gateways that
   * predate it. Feature-detect flag only — the gateway is the sole enforcer.
   */
  computeUsage?: boolean;
}

// ---------- Org / roles (multiplayer) ----------

/**
 * A member's authority inside a multiplayer org. `owner` is the billing/root
 * seat, `admin` manages members + agents, `user` is a plain seat that can only
 * use the agents assigned to them. Kept in sync (by hand) with the protocol
 * `OrgRole` — the engine side is the source of truth.
 */
export type OrgRole = "owner" | "admin" | "user";

/** One member of the current user's org. */
export interface OrgMember {
  userId: string;
  /** The member's email, when the host exposes it to the caller. */
  email?: string;
  role: OrgRole;
}

/**
 * A per-agent access level (Teams v2). `manager` may reconfigure the agent
 * (instructions, skills, model, allowed toolkits, assignments); `user` may only
 * use it. Kept in sync (by hand) with the gateway — the server is the source of
 * truth and clamps a stale `manager` row for a plain `user` member at read time.
 */
export type AgentAccess = "manager" | "user";

/** One member's access level for a shared agent. */
export interface AgentAssignment {
  userId: string;
  access: AgentAccess;
}

/**
 * A pending invite to the org, surfaced to owner/admin on `GET /org`. `email`
 * is the invited address; the invite is consumed on that user's first sign-in.
 * `createdAt` is epoch milliseconds.
 */
export interface OrgInvite {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: number;
}

/**
 * The current user's org, with the caller's own role. `members` is populated
 * only for callers allowed to see the roster (owner/admin); a plain `user`
 * gets just the identity fields. `invites` (pending, un-consumed) is likewise
 * owner/admin only.
 */
export interface OrgInfo {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
  members?: OrgMember[];
  /** Pending invites, for owner/admin callers only. */
  invites?: OrgInvite[];
}

/**
 * Result of `POST /org/members` (Teams v2). A known Houston user is added
 * directly (`userId` set); an unknown email creates a pending invite instead
 * and the host answers `202` with `invited: true`. `role` echoes the requested
 * role in both cases.
 */
export interface AddOrgMemberResult {
  /** Set when an existing user was added directly (not invited). */
  userId?: string;
  role: OrgRole;
  /** True when an invite was created because the email is not yet a user. */
  invited?: boolean;
  /** The invited email, echoed on the invite path. */
  email?: string;
}

// ---------- Spaces / teams (C8) ----------

/**
 * Billing status of a team space (C8 §Billing wire surface). Attached to an
 * `OrgSummary` only for teams and only for owner/admin callers; the DERIVED
 * effective `status` (never a stored column) drives every UI billing state.
 * `seats` is the live `count(org_members)` at read time. Kept in sync by hand
 * with the gateway — the server is the source of truth.
 */
export interface BillingSummary {
  plan: "team" | "enterprise";
  status: "free" | "trialing" | "active" | "past_due" | "expired";
  /** ISO-8601; present once the trial clock exists. */
  trialEndsAt?: string;
  seats: number;
  /** Present once subscribed. */
  interval?: "monthly" | "annual";
}

/**
 * A Stripe-hosted URL to redirect the owner to (C8 §Billing wire surface).
 * Returned by `POST /v1/org/billing/checkout` (contextual card capture) and
 * `POST /v1/org/billing/portal` (card, invoices, interval switch, cancel). The
 * client opens it via the OS external-open path — never inline.
 */
export interface BillingCheckout {
  url: string;
}

/**
 * One active personal API key (C9 §Credential), from `GET /v1/keys` and (minus
 * the secret) the mint response. `prefix` is the display-safe head of the key
 * (`hst_` + first 8 hex) shown so the user can tell keys apart; the full secret
 * is NEVER carried here. `lastUsedAt` is absent until the key first authenticates
 * a request.
 */
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  /** ISO-8601 creation instant. */
  createdAt: string;
  /** ISO-8601 instant the key last authenticated a request; absent if never used. */
  lastUsedAt?: string;
}

/**
 * The mint response of `POST /v1/keys` (C9): a fresh key plus its FULL secret.
 * `key` (`hst_` + 64 hex) appears ONLY in this response and can never be
 * retrieved again, so the UI holds it in local state for the one-time reveal and
 * MUST keep it out of any query cache.
 */
export interface ApiKeyCreated extends ApiKey {
  key: string;
}

/**
 * One space (org) the caller belongs to (C8 §Wire surface — spaces), from
 * `GET /v1/orgs` and `POST /v1/orgs`. `kind` is derived server-side from
 * `personal_of` — `personal` is the free-forever personal space, `team` is a
 * paid-per-seat team. `role` is the caller's role IN THIS space. `degraded` is
 * `true` when writes would `403 needs_upgrade` (visible to every member, carries
 * no billing detail). `billing` is present for teams, owner/admin only.
 *
 * The space's `slug` is what pins the active space: a team's switcher workspace
 * id is `"org:" + slug` (C8 §Workspaces bridge), and that slug rides
 * `x-houston-org` / `?org=` (see `HoustonClient.setActiveOrg`).
 */
export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  role: OrgRole;
  memberCount: number;
  degraded: boolean;
  billing?: BillingSummary;
}

/**
 * A pending invite addressed to the caller's email (C8 §Wire surface), from
 * `GET /v1/orgs` (`invites`). Accepted via `POST /v1/org-invites/:id/accept` or
 * declined via `DELETE /v1/org-invites/:id`.
 */
export interface OrgInviteSummary {
  id: string;
  orgName: string;
  role: OrgRole;
  invitedBy?: string;
}

/**
 * Response of `GET /v1/orgs` (C8): every membership plus every pending invite
 * addressed to the caller. Degrades to an empty result on a host that predates
 * spaces (404) so the switcher shows only the personal workspace.
 */
export interface OrgsList {
  orgs: OrgSummary[];
  invites: OrgInviteSummary[];
}

/**
 * Response of `POST /v1/agents/:slug/move` (C8 §Agent move): the id to poll for
 * move progress. The move route is async — `202 {moveId}` — because a move stops
 * and restarts the agent's pod; completion is read from `getMoveStatus`, NEVER
 * inferred from the agent event stream (which only relays pod-scoped events).
 */
export interface AgentMoveStart {
  moveId: string;
}

/**
 * Progress of one agent move (C8), polled from
 * `GET /v1/agents/:slug/move/:moveId`. `done`/`failed` are terminal; `error` is
 * a human-readable reason present on `failed`. The share pipeline MUST poll this
 * to terminal `done` before inviting (C8 §Share-triggers-team) — inviting before
 * the move completes is forbidden by the client contract.
 */
export interface AgentMoveStatus {
  status: "moving" | "done" | "failed";
  error?: string;
}

/**
 * Per-agent settings (Teams v2), from `GET /agents/:slug/settings`.
 * `allowedToolkits` is the agent-level integration ceiling (`null` =
 * unrestricted, `[]` = none) and is the WHOLE effective allowlist — policy is
 * per agent only (org-wide ceilings were removed as overengineering). `access`
 * is the caller's effective access. `allowedModels` is the manager-set AI-model
 * ceiling: which models a member may pick for this agent (`null` = every model
 * allowed, `[]` = none). Each member's own per-agent pick lives in the separate
 * model-choice surface below; the gateway clamps that pick to this ceiling on
 * every turn.
 */
export interface AgentSettings {
  allowedToolkits: string[] | null;
  access: AgentAccess;
  allowedModels: string[] | null;
}

// ---------- Per-user model choice (multiplayer) ----------

/**
 * A member's chosen AI model for one shared agent (Teams v2). The agent runs on
 * the ACTING user's choice per turn; the gateway clamps it to the agent's
 * `allowedModels` ceiling. `effort` is the
 * optional reasoning-effort the composer surfaces alongside the model.
 */
export interface AgentModelChoice {
  provider: string;
  model: string;
  effort?: string;
}

/**
 * Response of `GET /agents/:slug/model-choice` (any assigned caller / owner):
 * the caller's own `choice` (or `null` when they have not picked one) plus the
 * agent's effective `allowedModels` ceiling (`null` = every model allowed) so
 * the composer can offer exactly the pickable set.
 */
export interface AgentModelChoiceInfo {
  choice: AgentModelChoice | null;
  allowedModels: string[] | null;
}

/**
 * One audit-log entry (Teams v2), newest-first from `GET /org/audit`.
 * `action` is a stable slug (e.g. `agent.rename`, `member.add`, `agent.share`);
 * `subject` is action-specific JSON; `createdAt` is epoch milliseconds.
 */
export interface AuditEntry {
  id: number;
  orgId: string;
  actor: string;
  action: string;
  agentSlug?: string;
  subject: unknown;
  createdAt: number;
}

/**
 * One usage-counter row (Teams v2) from `GET /org/usage`: message count for a
 * (agent, user, day) tuple. `day` is a `YYYY-MM-DD` UTC date.
 */
export interface UsageRow {
  agentSlug: string;
  userId: string;
  day: string;
  messages: number;
}

/**
 * One compute-usage row from `GET /org/compute-usage`: engine running time for
 * an (agent, day) tuple. `day` is a `YYYY-MM-DD` UTC date. `awakeMs` is the
 * wall-clock the agent's engine was up that day (today's row includes the
 * currently-open stretch up to `ComputeUsage.asOf`); `activeMs` is the subset
 * spent actually executing turns/routine runs (recorded for later use, not
 * rendered yet — never sum it with `awakeMs`).
 */
export interface ComputeUsageRow {
  agentSlug: string;
  day: string;
  awakeMs: number;
  activeMs: number;
  wakes: number;
  turns: number;
  routineRuns: number;
}

/** Response of `GET /org/compute-usage`. Days with no data have no row. */
export interface ComputeUsage {
  /** Server clock when the snapshot was taken (RFC 3339). */
  asOf: string;
  /** Slugs of agents whose engine is up right now — their "today" still grows. */
  awakeNow: string[];
  rows: ComputeUsageRow[];
}

// ---------- Workspaces ----------

/**
 * Which kind of space a workspace bridges (C8 §Workspaces bridge). Mirrors the
 * host domain `WorkspaceKind` (`packages/host/src/domain/types.ts`). `personal`
 * ⟺ OrgSummary `personal`, `org` ⟺ OrgSummary `team`.
 */
export type WorkspaceKind = "personal" | "org";

export interface Workspace {
  /**
   * Stable id. A hosted **personal** space keeps its existing auto-provisioned
   * id — opaque, NEVER `org:`-prefixed. A hosted **team** space (`kind: "org"`)
   * has the server-defined id grammar `"org:" + slug`, where `slug` is
   * `[a-f0-9]{16}`. The `org:` prefix is a wire convention: strip it to recover
   * the slug for `setActiveOrg` / `?org=`, but never synthesize or parse the
   * slug beyond that (C8).
   */
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  /**
   * Which kind of space this row bridges (C8 §Workspaces bridge). Present on
   * hosts that serve spaces; ABSENT on single-player/self-host hosts (treat as
   * `"personal"`), so every pre-C8 profile stays valid. Selecting a `personal`
   * workspace sends NO active-space header; selecting an `org` workspace pins
   * `x-houston-org` (and `?org=` on the SSE routes) to its slug.
   */
  kind?: WorkspaceKind;
  /**
   * Optional per-workspace UI-locale override (BCP-47 base tag: `en`/`es`/`pt`).
   * Absent/null means the workspace inherits the global `locale` preference.
   */
  locale?: string | null;
  provider?: string;
  model?: string;
}

export interface CreateWorkspace {
  name: string;
  provider?: string;
  model?: string;
}

export interface RenameWorkspace {
  newName: string;
}

export interface UpdateProvider {
  provider: string;
  model?: string;
}

export interface WorkspaceContext {
  workspace: string;
  user: string;
}

/** A user-created, collapsible sidebar section that agents are dragged into. */
export interface SidebarGroup {
  /** Stable client-minted id (never an agent id). */
  id: string;
  name: string;
  collapsed: boolean;
  /** Member agent ids, in drag order. */
  agentIds: string[];
  /** Shared context injected into every member agent's system prompt (a
   *  group-scoped `WORKSPACE.md`), mirrored to each member's `GROUP.md`.
   *  Absent/empty = no group context. */
  context?: string;
}

/**
 * Per-workspace sidebar arrangement: the user's named groups plus the manual
 * (drag) order of everything. Ordering is ALWAYS manual — there is no sort
 * mode. Agents in no group render in the default section in `ungroupedOrder`;
 * a brand-new agent is appended. Persisted as the `sidebar_layout` workspace
 * preference (JSON). Absent/corrupt reads as `{ groups: [], ungroupedOrder: [] }`.
 */
export interface SidebarLayout {
  /** Named groups, in display order. */
  groups: SidebarGroup[];
  /** Drag order of agents not in any group. */
  ungroupedOrder: string[];
}

// ---------- Workspace-scoped agent CRUD ----------

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color?: string;
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
}

export interface CreateAgent {
  name: string;
  configId: string;
  color?: string;
  claudeMd?: string;
  installedPath?: string;
  seeds?: Record<string, string>;
  existingPath?: string;
}

export interface CreateAgentResult {
  agent: Agent;
}

export interface UpdateAgent {
  color: string;
}

// ---------- Agents / agent-data files ----------

export interface InteractionOption {
  id: string;
  label: string;
  /** One muted line of consequence or benefit shown after the label. */
  description?: string;
  /** Mark AT MOST one option as the suggested default. */
  recommended?: boolean;
}

/** One step in the interaction sequence. `id` is tool-assigned (`q1`..`qN` for
 *  question steps, `s1` for the single signin step, `c1`..`cN` for connect
 *  steps, `a1`..`aN` for approval steps) so each step's outcome is addressable. */
export type InteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      options?: InteractionOption[];
    }
  | { kind: "signin"; id: string; reason?: string }
  | { kind: "connect"; id: string; toolkit: string; reason?: string }
  /** The user must enter a custom integration's API key in a secure field (never
   *  into the chat). `toolkit` is the custom integration's slug (HOU-550). */
  | { kind: "credential"; id: string; toolkit: string; reason?: string }
  /** The model finished planning: a short plan summary the user approves by
   *  choosing a mode (start working / Autopilot) or dismisses to keep planning. */
  | { kind: "plan_ready"; id: string; summary: string }
  /** The model finished cleanly and offers to save the just-completed work as a
   *  reusable Skill, a scheduled Routine, or a Learning to remember. Optional and
   *  dismissible: unlike the other kinds, a lone `suggest_reusable` step does NOT
   *  flip the board to `needs_you` (the mission genuinely finished). Mirrors
   *  `packages/protocol/src/domain/interaction.ts`. */
  | {
      kind: "suggest_reusable";
      id: string;
      reusableKind: "skill" | "routine" | "learning";
      title: string;
      rationale: string;
    }
  /** An integration action awaiting the user's permission. Blocking, like the
   *  question/signin/connect kinds: present → `needs_you`. Approvals land LAST in
   *  the sequence (approving happens after the toolkit is connected). Mirrors
   *  `packages/protocol/src/domain/interaction.ts`. */
  | {
      kind: "approval";
      /** Tool-assigned id: `a1`..`aN`, in first-seen order. */
      id: string;
      /** Lowercase toolkit slug, e.g. "gmail". */
      toolkit: string;
      /** The action slug, e.g. "GMAIL_SEND_DRAFT". */
      action: string;
      /** Display-ready key/values for the card's param rows (values already truncated host-side). */
      params?: Record<string, string>;
      /** How many params were dropped past the card's row cap (present only when
       *  > 0). The card surfaces it so the user knows the hash covers settings
       *  the rows don't show. */
      paramsOmitted?: number;
      /** Stable short digest of (action, raw params), minted host-side; the one-shot allow ticket is keyed by it. */
      paramsHash: string;
    };

/**
 * The ordered steps a mission is waiting on the user for — recorded when the
 * model ends a turn by asking (ask_user) and/or requesting a connection
 * (request_connection). Present drives the `needs_you` board card and the
 * composer-replacing card, which walks the user through the steps one at a time;
 * absent means the mission needs nothing. Question steps come first (at most 3),
 * then at most one signin step, then connect steps, then approval steps (last —
 * approving happens after connecting).
 */
export interface PendingInteraction {
  steps: InteractionStep[];
}

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
  updated_at?: string;
  provider?: string;
  model?: string;
  pending_interaction?: PendingInteraction;
  /** The human who created this mission (Teams attribution). Server-stamped
   *  from the gateway acting-as identity; absent on desktop/single-player. */
  created_by?: string;
  /** Humans who started or collaborated on this mission (Teams attribution).
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  contributors?: { user_id: string; name?: string }[];
}

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  provider?: string;
  model?: string;
  /** Set to record a new pending interaction; `null` clears it explicitly. */
  pending_interaction?: PendingInteraction | null;
}

export interface NewActivity {
  /**
   * Client-generated id, so the caller knows the id (and the derived
   * `activity-<id>` session key) before the request lands — optimistic
   * mission creation against a warming engine (HOU-693). Omitted → the
   * host assigns one.
   */
  id?: string;
  title: string;
  description?: string;
  agent?: string;
  provider?: string;
  model?: string;
}

/**
 * Whether a routine's runs share one chat or each start a fresh one.
 * `"shared"` (the default) keeps one chat per routine; `"per_run"` surfaces
 * each run in its own chat.
 */
export type RoutineChatMode = "shared" | "per_run";

/**
 * An event binding that wakes a routine on an external Composio trigger instead
 * of a cron `schedule` (C9 event-driven routines). `toolkit` + `trigger_slug`
 * name the trigger type (e.g. `gmail` / `GMAIL_NEW_GMAIL_MESSAGE`);
 * `trigger_config` is the instance filter object, validated server-side against
 * the trigger type's config JSON-schema. `connected_account_id` is pinned only
 * when the user has more than one connected account for the toolkit; absent, the
 * reconciler resolves the single active one. Exactly one of `schedule` /
 * `trigger` is set on a routine (enforced server-side).
 */
export interface RoutineTriggerBinding {
  toolkit: string;
  trigger_slug: string;
  trigger_config: Record<string, unknown>;
  connected_account_id?: string;
}

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  /**
   * Cron expression the scheduler wakes this routine on. Absent when the routine
   * is event-driven (`trigger` set instead) — exactly one of `schedule`/`trigger`
   * is present.
   */
  schedule?: string;
  /**
   * Event binding that wakes this routine on an external Composio event (C9),
   * instead of `schedule`. Exactly one of the two is set.
   */
  trigger?: RoutineTriggerBinding;
  enabled: boolean;
  suppress_when_silent: boolean;
  /** Whether each run reuses one chat or starts a fresh one. */
  chat_mode: RoutineChatMode;
  /** Composio toolkit slugs this routine uses (e.g. ["gmail", "slack"]). */
  integrations: string[];
  /** Provider id override (e.g. "anthropic", "openai"); absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override (e.g. "claude-opus-4-8", "gpt-5.5"); absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override (e.g. "high", "max"); absent means inherit the agent's effort. */
  effort?: string | null;
  /**
   * Id of the setup-chat activity attached to this routine — the persistent
   * conversation shown next to the routine form.
   */
  setup_activity_id?: string;
  /**
   * Multiplayer only: the org-member user id that created this routine. Absent
   * in single-player mode. Surfaced so the UI can attribute automations.
   */
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface NewRoutine {
  name: string;
  prompt: string;
  /** Cron expression to wake on; omit when creating an event-driven routine
   *  (pass `trigger` instead). Exactly one of `schedule`/`trigger` is set. */
  schedule?: string;
  /** Event binding to wake on instead of a cron schedule (C9). Exactly one of
   *  `schedule`/`trigger` is set. */
  trigger?: RoutineTriggerBinding;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  /** Defaults to `"shared"` (one chat per routine) when omitted. */
  chat_mode?: RoutineChatMode;
  /** Composio toolkit slugs this routine uses. */
  integrations?: string[];
  /** Provider id to pin (e.g. "openai"); omit to inherit the agent's provider. */
  provider?: string | null;
  /** Model to pin (e.g. "gpt-5.5"); omit to inherit the agent's model. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"); omit to inherit the agent's effort. */
  effort?: string | null;
  /** Setup-chat activity to attach; omit for routines created without a chat. */
  setup_activity_id?: string;
}

export interface RoutineUpdate {
  name?: string;
  prompt?: string;
  /** Switch to (or keep) a cron wake; pair with `trigger: null` to move a
   *  routine off an event binding. Exactly one of `schedule`/`trigger` ends set. */
  schedule?: string;
  /** Switch to (or keep) an event wake; pass `null` to move the routine back to a
   *  cron `schedule`. Omit to leave the current wake mechanism unchanged. */
  trigger?: RoutineTriggerBinding | null;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  integrations?: string[];
  /** Provider id to pin (e.g. "openai"); omit or null to leave unchanged. */
  provider?: string | null;
  /** Model to pin (e.g. "gpt-5.5"); omit or null to leave unchanged. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"); omit or null to leave unchanged. */
  effort?: string | null;
  /** Attach a setup-chat activity to this routine; omit to leave unchanged. */
  setup_activity_id?: string;
}

export type RoutineRunStatus =
  | "running"
  | "silent"
  | "surfaced"
  | "error"
  | "cancelled";

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RoutineRunStatus;
  session_key: string;
  activity_id?: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
  /** Human-readable reset hint while the provider CLI is sleeping on a
   *  usage-limit window. Only meaningful when status is `running`. */
  paused_until?: string;
}

export interface RoutineRunUpdate {
  status?: RoutineRunStatus;
  activity_id?: string;
  summary?: string;
  completed_at?: string;
  /** Pass `string` to set the hint, `null` to clear, omit to leave alone. */
  paused_until?: string | null;
}

export interface ProjectConfig {
  name?: string;
  provider?: string;
  model?: string;
  effort?: string;
  [extra: string]: unknown;
}

export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  /** Last modification time in milliseconds since the UNIX epoch. Omitted
   * when the filesystem doesn't expose mtime for the entry. */
  date_modified?: number;
  /** Creation time in milliseconds since the UNIX epoch. Omitted when the
   * storage backend doesn't report one (e.g. Linux without birthtime). */
  date_created?: number;
}

export interface InstalledConfig {
  config: unknown;
  path: string;
}

// ---------- Conversations ----------

export interface ConversationEntry {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: string;
  session_key: string;
  updated_at?: string;
  agent_path: string;
  agent_name: string;
  agent?: string;
  routine_id?: string;
  /** The human who created this mission (Teams attribution). Server-stamped
   *  from the gateway acting-as identity; absent on desktop/single-player. */
  created_by?: string;
  /** Humans who started or collaborated on this mission (Teams attribution).
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  contributors?: { user_id: string; name?: string }[];
}

// ---------- Skills ----------

export interface SkillSummary {
  name: string;
  /**
   * Display title from frontmatter `title:` — accents/casing the directory
   * slug can't carry (translated store skills). Null → humanize the slug.
   */
  title: string | null;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  lastUsed: string | null;
  /** Optional user-facing category. Drives grouping in the "New mission" picker. */
  category: string | null;
  /** Surface this skill on the Featured tab of the "New mission" picker. */
  featured: boolean;
  /** Composio toolkit slugs this skill touches (e.g. ["gmail", "slack"]). */
  integrations: string[];
  /** Image URL or Microsoft Fluent 3D Emoji slug (e.g. "rocket"). */
  image: string | null;
  /** Legacy structured inputs. Parsed for compatibility, ignored by composer UX. */
  inputs: SkillInputDef[];
  /** Legacy prompt template. Parsed for compatibility, ignored by sends. */
  promptTemplate: string | null;
}

export interface SkillInputDef {
  name: string;
  label: string;
  placeholder?: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  default?: string;
  /** Options for `type: select`. Empty for text/textarea. */
  options?: string[];
}

export interface SkillDetail {
  name: string;
  /** Display title from frontmatter `title:`; null → humanize the slug. */
  title: string | null;
  description: string;
  version: number;
  content: string;
}

export interface CreateSkillRequest {
  workspacePath: string;
  name: string;
  description: string;
  content: string;
}

export interface SaveSkillRequest {
  workspacePath: string;
  content: string;
}

export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface InstallFromRepoRequest {
  workspacePath: string;
  source: string;
  skills: RepoSkill[];
}

export interface InstallCommunityRequest {
  workspacePath: string;
  source: string;
  skillId: string;
}

export interface CommunitySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

/** Full detail fetched on-demand for a community skill, read from its real SKILL.md. */
export interface CommunitySkillPreview {
  title: string | null;
  description: string;
  image: string | null;
  category: string | null;
  tags: string[];
}

// ---------- Providers / preferences ----------

/**
 * Where Houston found the CLI binary backing a provider. Surfaced so
 * the UI can label whether the user is talking to a copy Houston shipped
 * (`bundled`), one Houston downloaded for them (`managed`), one already
 * on their PATH (`path`), or nothing at all (`missing`).
 *
 * Mirrors the Rust `houston_engine_core::provider::InstallSource` enum
 * with `#[serde(rename_all = "lowercase")]`.
 */
export type CliInstallSource = "bundled" | "managed" | "path" | "missing";
export type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

export interface ProviderStatus {
  provider: string;
  cliInstalled: boolean;
  authState: ProviderAuthState;
  cliName: string;
  installSource: CliInstallSource;
  /** Absolute path to the CLI binary that will be spawned, or `null`
   *  when `installSource === "missing"`. Useful for diagnostics UI. */
  cliPath: string | null;
  /**
   * The provider's currently-configured model id, when the engine reports one.
   * Carries the OpenAI-compatible (local) provider's user-supplied model — which
   * is dynamic and absent from the static frontend catalog — so the model picker
   * can show + select it. Absent for providers whose models live in the catalog.
   */
  activeModel?: string;
}

/**
 * Stable rate-limit window identifiers on a provider account, mapped to
 * translated labels by the frontend: `session` = the short rolling window
 * (Claude 5h, Codex primary), `week`/`week_opus` = 7-day windows, `month` =
 * monthly, `premium`/`chat`/`completions` = Copilot's quota lanes.
 * Mirrors `@houston/protocol`.
 */
export type ProviderUsageWindowId =
  | "session"
  | "week"
  | "week_opus"
  | "month"
  | "premium"
  | "chat"
  | "completions";

/** One rolling rate-limit window on a connected provider account. */
export interface ProviderUsageWindow {
  id: ProviderUsageWindowId;
  /** 0–100, clamped engine-side; never NaN. */
  usedPercent: number;
  /** ISO 8601 instant the window resets, when the provider reports one. */
  resetsAt: string | null;
  /** Window length in minutes, when the provider reports one (300 = 5h). */
  windowMinutes?: number;
}

/** Prepaid balance for API-key providers that expose one. */
export interface ProviderUsageCredits {
  remaining: number;
  /** Total granted, when reported. */
  granted?: number;
  unit: "USD" | "credits";
}

/**
 * Cumulative token spend metered locally by Houston, for API-key providers
 * with no account-usage API to probe (Gemini, Bedrock, OpenCode, MiniMax,
 * custom endpoints). Mirrors `@houston/protocol`.
 */
export interface ProviderUsageTokens {
  inputTokens: number;
  outputTokens: number;
  /** Turns metered into this row. */
  turns: number;
  /** ISO 8601 instant metering started (the first recorded turn). */
  since: string;
}

export type ProviderUsageStatus =
  | "ok"
  | "unsupported" // the provider has no usage surface Houston can read
  | "unauthenticated" // no readable credential for the usage probe
  | "error"; // the probe failed (network, provider outage, bad payload)

/**
 * One connected provider account's live usage — rate-limit windows for
 * subscription providers, a credit balance for prepaid API keys. One row per
 * CONNECTED provider (`providerUsage()`); unreadable providers report an
 * honest non-`ok` status instead of being omitted.
 */
export interface ProviderUsage {
  provider: string;
  status: ProviderUsageStatus;
  windows: ProviderUsageWindow[];
  credits?: ProviderUsageCredits;
  /** Locally metered token spend, for providers with no usage API to probe. */
  tokens?: ProviderUsageTokens;
  /** Plan/tier name when the provider reports one (e.g. Codex "pro"). */
  plan?: string;
  /** ISO 8601 instant the row was fetched (`ok` rows only). */
  fetchedAt?: string;
  /** Human-readable failure detail (`error` rows only; never a secret). */
  message?: string;
}

export interface PreferenceValue {
  value: string | null;
}

/**
 * Known preference keys. Free-form strings are still allowed — this alias
 * just documents the well-known keys and gives consumers completion.
 *
 * Keep in sync with `houston-engine-core::preferences` constants.
 */
export type KnownPreferenceKey =
  | "timezone"
  | "locale"
  | "legal_acceptance"
  | "migration_reconnect_dismissed";

/**
 * Persisted record that the user has accepted a given version of the
 * in-app security disclaimer. Stored as the JSON-encoded value of the
 * `"legal_acceptance"` preference. The frontend re-prompts whenever the
 * stored `version` is lower than the current in-app constant.
 */
export interface LegalAcceptance {
  version: number;
  /** RFC3339 timestamp captured at the moment of acceptance. */
  acceptedAt: string;
}

/** Preference key for the JSON-encoded [`LegalAcceptance`]. */
export const LEGAL_ACCEPTANCE_KEY = "legal_acceptance";

/**
 * Preference key marking that the user has seen (and dismissed/completed) the
 * one-time "reconnect your AI" moment shown after migrating from the legacy
 * desktop build. Value is the literal `"1"` once set; absent means not yet
 * shown. Lives in engine preferences so it survives reinstall-in-place.
 */
export const MIGRATION_RECONNECT_DISMISSED_KEY =
  "migration_reconnect_dismissed";

// ---------- Store ----------

export interface StoreListing {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string[];
  icon_url: string;
  integrations?: string[];
  repo: string;
  installs: number;
  registered_at: string;
  version?: string;
  content_hash?: string;
  bundled?: boolean;
}

export interface InstallAgent {
  repo: string;
  agentId: string;
}

export interface InstallFromGithub {
  githubUrl: string;
}

export interface ImportedWorkspace {
  workspaceId: string;
  workspaceName: string;
  agentIds: string[];
}

// ---------- Tunnel (mobile pairing + paired-device management) ----------

export interface TunnelStatus {
  connected: boolean;
  tunnelId: string | null;
  publicHost: string | null;
  lastActivityMs: number | null;
}

export interface PairingCode {
  /** Full code mobile must send to `{relay}/pair/<code>` — already
   * prefixed with `tunnelId-`. Do not split on the dash before sending.
   */
  code: string;
  accessSecret: string;
  rotatedAt: string;
}

// ---------- Push (mobile notification registration) ----------

export interface PushRegisterRequest {
  deviceToken: string;
  platform: "apns" | "fcm";
  installationId?: string;
  appVersion?: string;
  appEnv?: "prod" | "sandbox";
}

// ---------- Worktree / shell ----------

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}

export interface CreateWorktreeRequest {
  repoPath: string;
  name: string;
  branch?: string;
}

export interface ListWorktreesRequest {
  repoPath: string;
}

export interface RemoveWorktreeRequest {
  repoPath: string;
  worktreePath: string;
}

export interface RunShellRequest {
  path: string;
  command: string;
}

// ---------- Sessions ----------

export interface SessionStartRequest {
  sessionKey: string;
  prompt: string;
  /**
   * What renders as the user's chat bubble, when it must differ from `prompt`.
   * The engine still receives `prompt` (the real text the model runs on);
   * `displayText` is presentation-only — the optimistic live bubble and the
   * replayed history bubble both render `displayText ?? prompt`. Set it when the
   * prompt carries text the user should never see: a hidden setup-mission
   * directive, or absolute attachment paths appended to the message.
   */
  displayText?: string;
  systemPrompt?: string;
  source?: string;
  workingDir?: string;
  provider?: string;
  model?: string;
  /**
   * Reasoning-effort override. Forwarded to the CLI as `--effort` (Claude) or
   * `-c model_reasoning_effort=<value>` (Codex). The tutorial uses this to
   * force `"medium"` so a stale global `~/.codex/config.toml` value can't
   * blow up the session.
   */
  effort?: string;
  /**
   * Per-turn agent mode. `"plan"` runs the turn read-only (no file writes or
   * side effects); `"auto"` (Autopilot) removes the blocking tools (ask_user,
   * request_connection) so the turn runs fire-and-forget; `"execute"` (the
   * default when omitted) runs it normally. Forwarded verbatim to the runtime,
   * which enforces it.
   */
  mode?: "execute" | "plan" | "auto";
  /**
   * Skip the turn stream's optimistic user bubble — for resends of a prompt
   * whose bubble is already in the conversation VM (a refused not-connected
   * send being retried verbatim).
   */
  suppressUserBubble?: boolean;
  /**
   * Composer preview for a send that lands in the adapter's queue while a turn
   * is running: the user's words + attachment names, rendered as a removable
   * queued bubble. Ignored when the conversation is idle. (Context-full
   * compaction and provider-switch handoffs are the RUNTIME's job now — there
   * are no per-send fields for them.)
   */
  queuedPreview?: { text: string; attachmentNames?: string[] };
}

export interface SessionStartResponse {
  sessionKey: string;
}

export interface SessionCancelResponse {
  cancelled: boolean;
}

export interface ChatHistoryEntry {
  feed_type: string;
  data: unknown;
  /**
   * Multiplayer only (C5): who wrote a `user_message` entry, carried through to
   * the ui/chat feed so a shared conversation attributes each teammate's bubble.
   * Absent on every other feed type and in single-player mode.
   */
  author?: { userId: string; name?: string };
}

export interface SummarizeResult {
  title: string;
  description: string;
}

export interface SummarizeOptions {
  agentPath?: string;
  provider?: string;
  model?: string;
}

export interface SuggestedIntegration {
  slug: string;
  displayName: string;
}

export interface SuggestedRoutine {
  name: string;
  prompt: string;
  schedule: string;
}

export interface GenerateInstructionsResult {
  name: string;
  instructions: string;
  suggestedIntegrations: SuggestedIntegration[];
  suggestedRoutine?: SuggestedRoutine | null;
}

// ---------- Attachments ----------

export interface AttachmentUploadRequest {
  name: string;
  size: number;
  mime?: string | null;
}

export interface CreateAttachmentUploadsRequest {
  scopeId: string;
  files: AttachmentUploadRequest[];
}

export interface AttachmentUploadTarget {
  id: string;
  name: string;
  size: number;
  uploadUrl: string;
  maxBytes: number;
}

export interface CreateAttachmentUploadsResponse {
  uploads: AttachmentUploadTarget[];
}

export interface AttachmentUploadResult {
  id: string;
  path: string;
  size: number;
  sha256: string;
}

export interface AttachmentManifest extends AttachmentUploadResult {
  scopeId: string;
  originalName: string;
  safeName: string;
  mime?: string | null;
  objectPath: string;
  createdAt: string;
}

// ---------- Claude Code installer ----------

/**
 * Stable failure `kind` for a Claude Code install attempt. Mirror of the
 * Rust `ClaudeInstallError` enum in
 * `engine/houston-ui-events/src/lib.rs` (serde `tag = "kind"`,
 * snake_case). The engine is i18n-agnostic, so it emits the slug and the
 * frontend localizes it. The two MUST stay in sync.
 */
export type ClaudeInstallErrorKind =
  | "timeout"
  | "network_unreachable"
  | "download_interrupted"
  | "http_error"
  | "checksum_mismatch"
  | "platform_unsupported"
  | "write_failed"
  | "manifest_missing"
  | "manifest_entry_missing"
  | "unknown";

/**
 * Typed install failure. `kind` is localized by the frontend; the
 * optional fields carry per-kind data. `detail` is technical text for
 * the bug report — never shown to a user verbatim.
 */
export interface ClaudeInstallError {
  kind: ClaudeInstallErrorKind;
  /** Present on `http_error`. */
  status?: number;
  /** Present on `platform_unsupported`. */
  platform?: string;
  /** Present on `checksum_mismatch` / `write_failed` / `unknown`. */
  detail?: string;
}

/**
 * Snapshot of the runtime Claude Code install. Returned by
 * `GET /v1/claude/status`.
 *
 * `lastInstallError` is the field the onboarding "Sign in with
 * Anthropic" card reads when `installed` is `false` — it disambiguates
 * "Houston tried to download Claude Code and failed (likely no
 * internet)" from "Houston hasn't tried yet". See issue #231 for the
 * UX bug this addresses.
 */
export interface ClaudeStatus {
  installed: boolean;
  installPath: string;
  pinnedVersion: string | null;
  installedVersion: string | null;
  lastInstallError: ClaudeInstallError | null;
}

// ---------- Composio ----------

export type ComposioStatus =
  | { status: "not_installed" }
  | { status: "needs_auth" }
  | { status: "ok"; email: string | null; org_name: string | null }
  | { status: "error"; message: string };

export interface ComposioAppEntry {
  toolkit: string;
  name: string;
  description: string;
  logo_url: string;
  categories: string[];
}

export interface ComposioStartLoginResponse {
  login_url: string;
  cli_key: string;
}

export interface ComposioStartLinkResponse {
  redirect_url: string;
  connected_account_id: string;
  toolkit: string;
}

export interface ComposioReconnectResponse {
  /**
   * Browser URL the user must open to finish OAuth re-consent, or `null`
   * when the auth scheme refreshed silently (e.g. API-key connections).
   */
  redirectUrl: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Portable agent (share / import "from a friend")
// ────────────────────────────────────────────────────────────────────────

export interface PortableClaudeMdPreview {
  byteCount: number;
  excerpt: string;
}

export interface PortableSkillPreview {
  slug: string;
  description: string;
  category: string | null;
  image: string | null;
  integrations: string[];
  featured: boolean;
}

export interface PortableRoutinePreview {
  id: string;
  name: string;
  promptExcerpt: string;
  /** Cron expression; absent for an event-driven (trigger) routine (C9). */
  schedule?: string;
  enabled: boolean;
  integrations: string[];
}

export interface PortableLearningPreview {
  id: string;
  text: string;
  createdAt: string;
}

export interface PortableInventoryPreview {
  claudeMd: PortableClaudeMdPreview | null;
  skills: PortableSkillPreview[];
  routines: PortableRoutinePreview[];
  learnings: PortableLearningPreview[];
}

export interface PortableExportSelection {
  includeClaudeMd: boolean;
  includeSkillSlugs: string[];
  includeRoutineIds: string[];
  includeLearningIds: string[];
}

export interface PortableRoutineFieldOverride {
  name?: string | null;
  prompt?: string | null;
}

export interface PortableExportOverrides {
  claudeMd?: string | null;
  skillBodies?: Record<string, string>;
  routineFields?: Record<string, PortableRoutineFieldOverride>;
  learningTexts?: Record<string, string>;
}

export interface PortableExportMeta {
  agentId: string;
  agentName: string;
  description?: string | null;
  exporter?: string | null;
  anonymized: boolean;
}

export interface PortableExportRequest {
  selection: PortableExportSelection;
  overrides?: PortableExportOverrides;
  meta: PortableExportMeta;
}

export interface PortableAnonymizeRequest {
  claudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
  /**
   * Run the AI pass on top of the pattern + secret scrub (the wizard's
   * "Let my AI help" toggle). Absent means true; false is a deliberate
   * user choice, so the response carries no `aiError`.
   */
  useAi?: boolean;
}

export interface PortableAnonymizedString {
  before: string;
  after: string;
  summary: string;
  becameEmpty: boolean;
}

export interface PortableAnonymizedItem {
  id: string;
  before: string;
  after: string;
  summary: string;
  becameEmpty: boolean;
}

export interface PortableRoutineFieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface PortableAnonymizedRoutine {
  id: string;
  fieldDiffs: PortableRoutineFieldDiff[];
  overridePayload: PortableRoutineFieldOverride;
}

export interface PortableAnonymizeResponse {
  claudeMd: PortableAnonymizedString | null;
  skills: PortableAnonymizedItem[];
  routines: PortableAnonymizedRoutine[];
  learnings: PortableAnonymizedItem[];
  /** Which redactor produced the diffs: the AI pass, or the regex patterns fallback. */
  mode: "ai" | "patterns";
  /** Why the AI pass didn't run (set only when `mode` is "patterns"). */
  aiError?: string;
}

export interface PortableManifestSummary {
  agentId: string;
  agentName: string;
  description: string | null;
  exporter: string | null;
  houstonVersion: string;
  createdAt: string;
  anonymized: boolean;
  formatVersion: number;
}

export interface PortableUploadPreviewResponse {
  packageId: string;
  manifest: PortableManifestSummary;
  preview: PortableInventoryPreview;
}

export type PortableScanCategory =
  | "exfiltration"
  | "prompt_injection"
  | "tool_abuse"
  | "suspicious_shell"
  | "external_callback";
export type PortableScanSeverity = "low" | "medium" | "high";
export type PortableScanItemKind =
  | "claude_md"
  | "skill"
  | "routine"
  | "learning";

export interface PortableScanFinding {
  category: PortableScanCategory;
  severity: PortableScanSeverity;
  excerpt: string;
  why: string;
}

export interface PortableScanItem {
  kind: PortableScanItemKind;
  id: string;
  findings: PortableScanFinding[];
}

export interface PortableScanResponse {
  disclaimer: string;
  items: PortableScanItem[];
}

export interface PortableInstallSelection {
  includeClaudeMd: boolean;
  includeSkillSlugs: string[];
  includeRoutineIds: string[];
  includeLearningIds: string[];
}

export interface PortableInstallRequest {
  packageId: string;
  workspaceName: string;
  agentName: string;
  agentColor?: string | null;
  selection: PortableInstallSelection;
}

export interface PortableInstalledAgent {
  agentPath: string;
  agentName: string;
  workspaceName: string;
  requiredIntegrations: string[];
  /** The created agent record, so the wizard can reveal it optimistically
   *  (same contract as agent create) instead of re-listing behind a warming
   *  pod (HOU-710). */
  agent: Agent;
}

// ────────────────────────────────────────────────────────────────────────
// Agent Store publication ("Publish to the Agent Store")
//
// Account-based, no manage tokens. The host gathers the same portable content
// the export flow produces and returns it as an AgentIR (no network); the APP
// POSTs that IR to the gateway `/v1/agentstore` API with the user's own bearer,
// then records a token-free pointer (store agent id + slug + share url) on the
// host so the manage view can look up the live listing and re-publish the SAME
// store agent instead of duplicating it.
// ────────────────────────────────────────────────────────────────────────

/** The listing metadata the publish wizard collects. */
export interface StorePublishIdentity {
  name: string;
  description: string;
  tagline?: string;
  /** A seeded store category slug (see the store's category vocabulary). */
  category: string;
  tags?: string[];
}

/** Who is credited on the store listing. */
export interface StorePublishCreator {
  displayName: string;
  url?: string;
}

/**
 * A publish (or update). The selection/overrides are the SAME portable
 * pick + anonymize outputs the export flow produces; the host re-gathers the
 * content from them, so a publish carries no packaged bytes.
 */
export interface StorePublishRequest {
  selection: PortableExportSelection;
  overrides?: PortableExportOverrides;
  identity: StorePublishIdentity;
  creator: StorePublishCreator;
  /** True when the pick ran through the anonymize pass (stamped on provenance). */
  anonymized?: boolean;
}

export interface StorePublishResponse {
  shareUrl: string;
  slug: string;
  storeAgentId: string;
}

export interface StoreUpdateResponse {
  shareUrl: string;
  slug: string;
}

export interface StoreUnpublishResponse {
  ok: boolean;
}

/**
 * Whether this agent is linked to an Agent Store listing, and its live state.
 * Account-based, so it carries no secret of any kind.
 */
export interface StorePublicationStatus {
  /** The store agent's live state is `published` (visible via its share URL). */
  published: boolean;
  /** A machine-local pointer exists (this agent was published at least once). */
  linked: boolean;
  shareUrl?: string;
  slug?: string;
  /** The store agent's id (uuid), for update/unpublish against the gateway. */
  storeAgentId?: string;
  publishedAt?: string;
  /** The public store site URL, for "browse the store". */
  storeUrl: string;
  /** The live listing fields, so the manage view can prefill the update form. */
  identity?: StorePublishIdentity;
}

// The public catalog wire types are the unified Agent Store SDK shapes
// (`@houston/agentstore-client`), reconciled against the authoritative Go
// handlers. The historical `StoreCatalog*` names are kept as aliases/re-exports
// so existing importers (the desktop store-view, the runtime adapter) compile
// unchanged. `StoreCatalogAgentDetail.ir` widens from the former
// `{ skills, learnings }` projection to the full `AgentIR` the gateway serves;
// the app still reads only `ir.skills`/`ir.learnings`.
export type {
  StoreCatalogPage,
  StoreCatalogQuery,
  StoreCatalogSort,
} from "@houston/agentstore-client";

/** One public Agent Store listing, exactly as the catalog API serializes it. */
export type StoreCatalogAgent = StoreAgentSummary;

/** A listing's detail: the summary plus the full published-version IR. */
export type StoreCatalogAgentDetail = StoreAgentDetail;

// ── integrations (Composio, platform mode) ───────────────────────────────────
// User-level: no provider account — the user only connects apps (Gmail, Slack…)
// via OAuth; Houston's platform key lives server-side, keyed by the user's id.

export interface IntegrationProviderStatus {
  provider: string;
  /** False on desktop until the user signs in to Houston (gateway needs it). */
  ready: boolean;
  reason?: "signin";
  /**
   * Legacy "Composio for you" connections were found for this install: the
   * user reconnects their apps once (framed as the security improvement it is
   * — their personal long-lived key is no longer used anywhere).
   */
  reconnect?: boolean;
}
export interface IntegrationToolkit {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
}
export interface IntegrationConnection {
  toolkit: string;
  connectionId: string;
  status: "active" | "pending" | "error";
}

// ── Custom integrations (HOU-550) ────────────────────────────────────────────
// User-added API / MCP servers that Composio does not offer. The host owns
// persistence and compiles them to agent tools; the frontend only lists them,
// removes them, and provides a secret for the ones waiting on a credential. The
// secret crosses ONLY on the credential POST body, never the chat transcript.

/** One credential input to collect, keyed by `variable` in the submit body. */
export interface CustomAuthField {
  variable: string;
  label: string;
}

/** An auth method the integration declares; one password field per `fields`. */
export interface CustomAuthMethod {
  template: string;
  label: string;
  fields: CustomAuthField[];
}

/** Live status of a custom integration inside the running host. */
export type CustomIntegrationState =
  | { status: "active"; toolCount: number }
  | { status: "pending"; authMethods: CustomAuthMethod[] }
  | { status: "error"; message: string };

/** What the host lists: the definition plus its live compiled state. */
export interface CustomIntegrationView {
  slug: string;
  name: string;
  kind: "openapi" | "mcp";
  /** The service URL shown to the user (spec url / MCP endpoint). */
  displayUrl?: string;
  addedAtMs: number;
  state: CustomIntegrationState;
  /** Present when a credential can be (re)provided — the fields to collect. */
  authMethods?: CustomAuthMethod[];
  /** Only on the credential POST's response: the advisory health-check verdict
   *  for the just-saved key (true = confirmed, false = probe rejected but the
   *  key SAVED, absent = the service declares no probe). */
  verified?: boolean;
}

// ── Triggers (C9 event-driven routines) ──────────────────────────────────────
// The event-wake surface: the catalog the routine editor's trigger picker reads,
// and the per-routine provisioning status the editor renders as a badge. Mirrors
// the host `IntegrationProvider` port types (`packages/host/src/integrations/`).

/**
 * One entry in a toolkit's trigger catalog (C9), from
 * `GET /v1/integrations/composio/trigger-types?toolkit=<slug>`: an event a
 * routine can wake on. `type` splits latency classes — `webhook` is
 * near-realtime, `poll` carries minutes of inherent delay (surfaced in UI copy).
 * `config` is the JSON schema for the instance filters the user fills in (e.g.
 * GitHub's owner/repo); `payload` (when present) is the JSON schema of the event
 * body Composio delivers. Both are opaque schemas the client never interprets.
 */
export interface TriggerType {
  slug: string;
  name: string;
  description?: string;
  type: "poll" | "webhook";
  config: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

/**
 * A trigger routine's live provisioning status (C9). `active` = the Composio
 * instance is provisioned and delivering; `pending` = reconcile in flight;
 * `paused_disconnected` = the connected account was disconnected;
 * `paused_revoked` = the toolkit fell outside the agent's allowlist;
 * `error` = Composio rejected creation or delivery is failing. A `paused_*` or
 * `error` badge carries a human-readable `detail`.
 */
export type TriggerStatusState =
  | "active"
  | "pending"
  | "paused_disconnected"
  | "paused_revoked"
  | "error";

/** One routine's trigger status, from `GET /v1/agents/:slug/trigger-status`. */
export interface TriggerStatusItem {
  routine_id: string;
  status: TriggerStatusState;
  detail?: string;
}

// ── OpenAI-compatible (local) provider ───────────────────────────────────────
// A local LLM server the user runs (Ollama / vLLM / LM Studio), connected by
// base URL + model id. New-engine + desktop only (the URL is the user's own
// machine). The key is optional — keyless local servers ignore it.
export interface CustomEndpoint {
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  /**
   * Share this endpoint with the active organization. Only meaningful when
   * saving in managed cloud; ignored elsewhere.
   */
  shared?: boolean;
  apiKey?: string;
}

// ── Local-model tunnel credentials ───────────────────────────────────────────
// One-click "connect a local model" issues a short-lived relay credential from
// the gateway (`POST /v1/tunnel/credentials`). The desktop then runs an frpc
// sidecar against `relayHost:relayPort` with `token`/`transport`, which exposes
// the user's local model server at `publicUrl` (under `subdomain`) so their
// CLOUD agent can reach it. New-engine + hosted only.
export interface TunnelCredentials {
  subdomain: string;
  publicUrl: string;
  relayHost: string;
  relayPort: number;
  token: string;
  /** ISO-8601 expiry of `token`; the desktop re-mints before it lapses. */
  tokenExpiresAt: string;
  transport: string;
}
