/**
 * Core in-memory store for the fake Houston host: the seed, the singleton
 * `state`, and the `/v1/events` domain-reactivity feed.
 *
 * The agent / activity / file / history mutation helpers live in the sibling
 * `state-agents.ts`, `state-activities.ts`, and `state-history.ts` modules;
 * they all read and write the `state` binding exported here and fan changes out
 * through {@link emitDomain}. One process serves every test; `reset()` restores
 * the seed between tests.
 *
 * Wire types come from the real packages so a contract change breaks the
 * typecheck here instead of silently drifting the mock.
 */

import type {
  Activity,
  Capabilities,
  Learning,
  SidebarLayout,
} from "@houston/protocol";
import type {
  ChatMessage,
  IntegrationConnection,
  TokenUsage,
} from "@houston/runtime-client";
import { SEED_AGENT_ID, SEED_AGENT_NAME, SEED_WORKSPACE_ID } from "./config";
import { resetProviders } from "./state-providers";
import { resetSharedSkills } from "./state-shared-skills";
import { resetSkills } from "./state-skills";

/**
 * Gateway integrations readiness, toggled by `/__test__/integrations-mode`:
 *  - `ready` — a Composio key is configured (the default),
 *  - `unavailable` — no key → every integrations route 503s,
 *  - `signin` — the provider reports `ready:false, reason:"signin"`,
 *  - `absent` — Composio is not registered at all (no key, no gateway): the
 *    readiness list omits it and its subroutes 404 — the shape a real host
 *    serves when only the key-free custom provider (HOU-550) is wired.
 */
export type IntegrationsMode = "ready" | "unavailable" | "signin" | "absent";

/**
 * One custom integration (HOU-550) as `GET /v1/integrations/custom/definitions`
 * serves it. Mirrors the engine-client's `CustomIntegrationView` wire shape
 * structurally (that type lives in `@houston-ai/engine-client`, which this
 * package does not depend on).
 */
export interface CustomIntegrationSeed {
  slug: string;
  name: string;
  kind: "openapi" | "mcp";
  /** `oauth` renders the Sign in affordance instead of Enter key
   *  (PRODUCT-1172). Optional like the wire field (old-host tolerance). */
  auth?: "none" | "credential" | "oauth";
  displayUrl?: string;
  iconUrl?: string;
  addedAtMs: number;
  state:
    | { status: "active"; toolCount: number }
    | {
        status: "pending";
        authMethods: {
          template: string;
          label: string;
          fields: { variable: string; label: string }[];
        }[];
      }
    | { status: "error"; message: string };
  authMethods?: {
    template: string;
    label: string;
    fields: { variable: string; label: string }[];
  }[];
  /** The compiled tools the detail card lists (HOU-980). Optional: an active
   *  seed without it serves a generated `action_N` list sized to toolCount. */
  tools?: { name: string; description?: string }[];
}

/**
 * The capabilities the fake host advertises at `GET /v1/capabilities`. It models
 * the GATEWAY-augmented view the client sees, so it extends the host's protocol
 * `Capabilities` with the two gateway-only feature-detect flags Teams adds
 * (`teams`, `spaces` — defined in `@houston-ai/engine-client`, not the host
 * protocol). `multiplayer` / `role` are already on the protocol type. The
 * `/__test__/capabilities` control merges a partial into this so a spec can arm
 * integrations, multiplayer, or the Teams surface without a forked build.
 */
export type FakeCapabilities = Capabilities & {
  teams?: boolean;
  spaces?: boolean;
  computeUsage?: boolean;
  /**
   * C13 agent teams. Mirrors the `agentTeams` feature-detect flag on
   * `@houston-ai/engine-client`'s `Capabilities` (gateway-only, like `teams`
   * and `spaces`, so the host protocol type does not carry it): armed on, the
   * client swaps its sidebar grouping to the server-owned teams below.
   */
  agentTeams?: boolean;
};

/**
 * A `GET /v1/org/compute-usage` row — one (agent, UTC day)'s engine running
 * time. Mirrors `@houston-ai/engine-client`'s `ComputeUsageRow` exactly so the
 * mock can't drift from the wire.
 */
export interface ComputeUsageSeedRow {
  agentSlug: string;
  day: string;
  awakeMs: number;
  activeMs: number;
  wakes: number;
  turns: number;
  routineRuns: number;
}

/** The armed compute-usage dataset (`/__test__/compute-usage`). */
export interface ComputeUsageSeed {
  rows: ComputeUsageSeedRow[];
  awakeNow: string[];
}

/** A caller's effective per-agent access (Teams v2). Mirrors the wire enum. */
export type AgentAccess = "manager" | "user";

/** An org role (Teams v2). Mirrors the engine-client `OrgRole` wire enum. */
export type OrgRole = "owner" | "admin" | "user";

/**
 * The signed-in caller's user id. The gateway derives it from the session; here
 * it is a fixture constant — the same id the seeded mission attribution, the
 * synthesized single-self roster, and the invites' `invitedBy` all speak of, and
 * the row `/v1/me/profile` reads and writes.
 */
export const SELF_USER_ID = "u-self";

/**
 * The active space's display name — what `GET /v1/org` serves and the name the
 * C13 default team is minted with (it is "named after the org"). One constant
 * so the two can never drift apart.
 */
export const FAKE_ORG_NAME = "Acme";

/**
 * One C13 agent team as the fake STORES it: the durable columns only. The three
 * fields the client actually renders (`joined`, `owner`, `memberCount`) plus
 * `agentSlugs` are the CALLER's effective values, resolved per read in
 * `state-agent-teams.ts` and never stored — the same split the gateway keeps.
 */
export interface FakeAgentTeam {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
}

/**
 * One EXPLICIT membership row (`gateway.team_memberships`). Implicit ownership
 * — an org owner/admin owns every team — is resolved at permission-check time
 * and NEVER written here, which is exactly what keeps a role change from
 * leaving stale team ownership behind.
 */
export interface FakeAgentTeamMember {
  userId: string;
  owner: boolean;
}

/**
 * The caller's own display profile as `GET`/`PUT /v1/me/profile` serve it. The
 * two fields are the EFFECTIVE values (the user's override when set, otherwise
 * the identity provider's), and `custom` says which of the two the user set
 * themselves — the split that lets the UI offer "reset to my Google photo".
 */
export interface FakeMeProfile {
  displayName?: string;
  photoUrl?: string;
  custom: { displayName: boolean; photoUrl: boolean };
}

/** One agent assignee with a per-person access level (the `AgentAssignment` wire shape). */
export interface FakeAssignment {
  userId: string;
  access: AgentAccess;
}

/** One org roster member (the `OrgMember` wire shape) `GET /v1/org` serves. */
export interface FakeMember {
  userId: string;
  email?: string;
  role: OrgRole;
  /** GCIP display name, when the gateway has one stored (Teams profiles). */
  displayName?: string;
  /** GCIP profile photo URL, when the gateway has one stored. */
  photoUrl?: string;
}

/** A pending org invite (the `OrgInvite` wire shape) `GET /v1/org` surfaces to
 *  owner/admin, minted by `POST /v1/org/members` for an unknown email. */
export interface FakeInvite {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: number;
}

/**
 * An armed team-space row the gateway bridges into `GET /v1/workspaces` (C8
 * Spaces, `cloud/docs/contracts/C8-spaces-billing.md` §Workspaces bridge). Its
 * id is `"org:" + slug` where slug is exactly 16 lowercase hex chars; the wire
 * `kind` is `"org"`. Armed by `/__test__/workspaces`; served alongside the
 * always-present personal seed row. Empty (the default) = personal-only, so the
 * list stays byte-identical to a single-workspace deployment.
 *
 * The same rows are the caller's team MEMBERSHIPS, which `GET /v1/orgs`
 * enumerates (`state-spaces.ts`) — one source of truth, so joining a team puts
 * it in the switcher and the org list at once, as the gateway does. `role` and
 * `memberCount` ride along for that list; both fall back to the advertised
 * capabilities role / a lone member when a spec armed only `{slug, name}`.
 */
export interface FakeTeamWorkspace {
  /** `"org:" + [a-f0-9]{16}`. */
  id: string;
  name: string;
  /** The caller's role in this team; defaults to the advertised caps role. */
  role?: OrgRole;
  /** People in the team; defaults to 1 (the caller alone). */
  memberCount?: number;
}

/**
 * A gateway rejection a spec can force on one invite, so the invitee-side
 * error paths are reachable without racing a real state change. Mirrors the C8
 * accept/decline codes (`cloud/internal/edge/spaces_routes.go`):
 * `needs_upgrade` (403, the invite STAYS — an upgrade makes it acceptable
 * again), `already_member` (409, also kept), `invite_not_found` (404, and the
 * invite is dropped from the served list — the revoked-between-fetch-and-click
 * case, whose refetch is what makes the stale card disappear).
 */
export type SpaceInviteRejection =
  | "needs_upgrade"
  | "already_member"
  | "invite_not_found";

/**
 * A pending invite addressed to the CALLER (C8 Spaces), as `GET /v1/orgs`
 * surfaces it in `invites` — the invitee-side inbox the sidebar renders under
 * the workspace switcher. NOT {@link FakeInvite}, which is an invite the ACTIVE
 * org's owner SENT and `GET /v1/org` surfaces to owner/admin.
 *
 * `orgSlug` is the 16-hex slug the joined team lands under in the workspaces
 * bridge (`org:<slug>`); it never reaches the wire (the summary carries only
 * `id`/`orgName`/`role`/`invitedBy`), it is what accepting turns into a
 * membership. `invitedBy` is the inviter's user id on the shipped gateway,
 * which the client deliberately refuses to render — a spec arms an email or a
 * spaced name to reach the "<name> invited you" headline.
 */
export interface FakeSpaceInvite {
  id: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
  invitedBy?: string;
  reject?: SpaceInviteRejection;
}

/**
 * The Teams v2 settings the gateway serves at `/v1/agents/:slug/settings`: the
 * agent's integration ceiling (`null` = unrestricted, `[]` = none — the whole
 * effective allowlist, policy is per agent only), the agent's AI-model ceiling,
 * and the caller's effective agent access. Seeded unrestricted; armed by
 * `/__test__/agent-settings`.
 */
export interface TeamsSettings {
  allowedToolkits: string[] | null;
  allowedModels: string[] | null;
  access: AgentAccess;
}

/** Single-player local profile — the default the app boots on (no Teams). */
export const DEFAULT_CAPABILITIES: FakeCapabilities = {
  profile: "local",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "disabled",
  providers: ["anthropic"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: true,
  // The fake models the loopback desktop deployment: custom-integration
  // sign-in available (PRODUCT-1172).
  customIntegrationOAuth: true,
};

/** Unrestricted, manager access — no policy until a spec arms one. */
export const DEFAULT_TEAMS_SETTINGS: TeamsSettings = {
  allowedToolkits: null,
  allowedModels: null,
  access: "manager",
};

/** The host's agent wire model, mapped to the UI `Agent` by control-plane.ts. */
export interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
  /**
   * Teams v2 (multiplayer only). `assignedUserIds: []` = shared with everyone;
   * `assignments` is the full roster with per-person access; `access` is the
   * served caller's effective level (owner-first: `manager`). Absent = the
   * single-player shape (no Teams fields on the wire). Armed by `/__test__/org`.
   */
  assignedUserIds?: string[];
  access?: AgentAccess;
  assignments?: FakeAssignment[];
}

export const ACTIVITY_PATH = ".houston/activity/activity.json";
export const ROUTINES_PATH = ".houston/routines/routines.json";
export const LEARNINGS_PATH = ".houston/learnings/learnings.json";
export const SEED_USAGE: TokenUsage = {
  context_tokens: 1200,
  output_tokens: 80,
  cached_tokens: 0,
};
export const EPOCH = Date.UTC(2024, 0, 1);
export const ISO = new Date(EPOCH).toISOString();

/**
 * Teams attribution on the seeded missions — the humans on each one, exactly as
 * the gateway stamps them (`created_by` + `contributors`). Two shapes on
 * purpose: a SMALL stack (creator + one collaborator, both photo-less so the
 * initials faces render) and a stack that OVERFLOWS the card's five-face cap,
 * so the "+N" chip has coverage.
 *
 * Seeding it on the existing missions (rather than adding cards) is deliberate:
 * face stacks are multiplayer-gated in the app, so a default single-player run —
 * including the visual-regression baselines — sees exactly the board it saw
 * before. A spec arms `/__test__/capabilities` `{ multiplayer: true }` to make
 * them appear. Names ride on the contributor entries, so a stack renders with
 * readable labels without a `/v1/org/profiles` round trip (identity is off in
 * the default e2e project).
 */
const SEED_TRIP_CONTRIBUTORS = [
  { user_id: SELF_USER_ID, name: "Ada Lovelace" },
  { user_id: "u-bob", name: "Bob Stone" },
];

const SEED_LAUNCH_CONTRIBUTORS = [
  { user_id: SELF_USER_ID, name: "Ada Lovelace" },
  { user_id: "u-bob", name: "Bob Stone" },
  { user_id: "u-cleo", name: "Cleo Nakamura" },
  { user_id: "u-dmitri", name: "Dmitri Volkov" },
  { user_id: "u-elena", name: "Elena Ruiz" },
  { user_id: "u-farid", name: "Farid Haddad" },
  { user_id: "u-gita", name: "Gita Raman" },
];

const SEED_ACTIVITIES: Activity[] = [
  {
    id: "act-1",
    title: "Plan a trip to Tokyo",
    description: "Research flights and hotels for the spring",
    status: "needs_you",
    updated_at: ISO,
    created_by: SELF_USER_ID,
    contributors: SEED_TRIP_CONTRIBUTORS,
  },
  {
    id: "act-2",
    title: "Draft the launch email",
    description: "Write the beta announcement to the waitlist",
    status: "done",
    updated_at: ISO,
    created_by: SELF_USER_ID,
    contributors: SEED_LAUNCH_CONTRIBUTORS,
  },
];

/**
 * Seeded memory for the Memory (learnings) tab. Two shapes on purpose:
 *  - one WITH provenance (HOU-946) — the person who taught it plus the mission
 *    it came from (`act-1`, so the live title lookup has something to resolve),
 *  - one with none, proving the provenance line is omitted rather than faked.
 *
 * The person's name rides ON the learning, exactly as the host stamps it, so it
 * reads without a `/v1/org/profiles` round trip — identity is off in the default
 * e2e project, and desktop / single-player has no roster either.
 */
const SEED_LEARNINGS: Learning[] = [
  {
    id: "learn-1",
    text: "Exclude churned accounts from pipeline math.",
    created_at: ISO,
    taught_by: { user_id: SELF_USER_ID, name: "Ada Lovelace" },
    mission_id: "act-1",
    mission_title: "Plan a trip to Tokyo",
  },
  {
    id: "learn-2",
    text: "Prefers metric units in every report.",
    created_at: ISO,
  },
];

export interface HostState {
  agents: CpAgent[];
  /** `${agentId}:${relPath}` -> file content (the `.houston/**` files-first store) */
  files: Map<string, string>;
  /** `${agentId}:${relPath}` -> workspace file (the Files tab's real files). */
  workspace: Map<string, { bytes: Buffer; created: number; modified: number }>;
  /** `${agentId}:${conversationId}` -> message history */
  histories: Map<string, ChatMessage[]>;
  agentSeq: number;
  activitySeq: number;
  /**
   * Monotonic counter for minted routine ids. GLOBAL, unlike the real host's:
   * there, routine ids are unique per AGENT, so two agents genuinely can hold
   * the same id. `/__test__/routine-seq` rewinds this so a spec can reproduce
   * that collision on purpose (the cross-agent list's whole keying rests on
   * it); nothing else touches it.
   */
  routineSeq: number;
  // ── user-scoped gateway state (integrations, preferences) ──
  /** Advertised capabilities, armed by `/__test__/capabilities` (Teams e2e). */
  capabilities: FakeCapabilities;
  /** Teams v2 integration/model ceilings, armed by `/__test__/agent-settings`. */
  teamsSettings: TeamsSettings;
  /**
   * Compute usage (running time), armed by `/__test__/compute-usage`. `null`
   * (the default) = the gateway does not serve the feature: the route 404s,
   * mirroring desktop/self-host and pre-feature gateways.
   */
  computeUsage: ComputeUsageSeed | null;
  /** Composio readiness, toggled by the `/__test__/integrations-mode` control. */
  integrationsMode: IntegrationsMode;
  /**
   * Cold-start hold (ms) on per-agent reads, armed by
   * `/__test__/hold-agent-reads`. Models the cloud gateway's `ensureAwake`
   * hold: every `GET /agents/:id/*` stalls this long before answering, the
   * way an asleep pod's reads stall until it wakes. `0` (the default and the
   * reset state) answers instantly.
   */
  agentReadHoldMs: number;
  /**
   * Agent ids whose per-agent READS answer `500`, armed by
   * `/__test__/fail-agent-reads`. Models the half-broken fleet the cross-agent
   * sweep must survive (HOU-981): one agent's pod is unreachable while every
   * other agent answers normally. Empty (the default and the reset state) =
   * every agent is healthy.
   */
  failingAgentReads: Set<string>;
  /**
   * Which sub-resources of those agents fail (`routines`, `routine_runs`,
   * `activities`, `files`, ...). `null` (the default) = the whole pod is
   * unreachable, every read 500s. A NAMED set is the subtler half-broken state
   * a surface must also survive: one route down while the rest of that same
   * agent answers, e.g. routines fine and their run history 500ing, which
   * leaves every row without its last-run line.
   */
  failingAgentReadSegments: Set<string> | null;
  /**
   * Custom integrations (HOU-550), armed by `/__test__/custom-integrations`.
   * `null` (the default) = the host does not serve the feature at all: no
   * `custom` entry in the readiness list and the definitions routes 404 (the
   * client degrades to hiding every custom surface). A present array (even
   * empty) = the key-free custom provider is wired and ready.
   */
  customIntegrations: CustomIntegrationSeed[] | null;
  /**
   * The org roster `GET /v1/org` serves (Teams v2), armed by `/__test__/org`.
   * `null` (the default) = the single-self roster synthesized from the advertised
   * role, preserving the pre-feature behavior; a present array is served verbatim.
   */
  orgMembers: FakeMember[] | null;
  /**
   * The identity-provider (Google/GCIP) display profile the gateway has stored
   * for the caller — what an effective field falls back to once its custom
   * override is CLEARED. Captured from the `SELF_USER_ID` row whenever a roster
   * is armed via `/__test__/org` (that row IS the stored provider profile), so
   * the fallback is never invented; `{}` (the default) = the provider gave none.
   */
  meProfileBase: { displayName?: string; photoUrl?: string };
  /**
   * The caller's OWN overrides, written by `PUT /v1/me/profile`. `null` (the
   * default for both) = never customized, so the effective value comes from
   * `meProfileBase`; a string wins over it and flips the served `custom` flag.
   */
  meProfileCustom: { displayName: string | null; photoUrl: string | null };
  /**
   * The pending org invites `GET /v1/org` surfaces (Teams v2), appended by
   * `POST /v1/org/members` when an unknown email is added. Empty (the default)
   * = no pending invites.
   */
  orgInvites: FakeInvite[];
  /** Monotonic counter for minted invite ids. */
  inviteSeq: number;
  /**
   * The team-space rows `GET /v1/workspaces` bridges in (C8 Spaces), armed by
   * `/__test__/workspaces`. Empty (the default) = personal-only, keeping the
   * switcher byte-identical to a single-workspace host. The same rows are the
   * memberships `GET /v1/orgs` enumerates.
   */
  teamWorkspaces: FakeTeamWorkspace[];
  /**
   * The invitee-side inbox `GET /v1/orgs` surfaces in `invites` (C8 Spaces),
   * armed by `/__test__/space-invites`. Empty (the default) = nothing pending,
   * so the sidebar renders no invite chrome at all.
   */
  spaceInvites: FakeSpaceInvite[];
  /** Monotonic counter for minted team-space slugs (`POST /v1/orgs`). */
  teamSeq: number;
  /**
   * The active space's C13 agent teams. Empty (the default) = none minted yet:
   * the first teams READ mints the default team lazily and idempotently, named
   * after the org, exactly as the gateway does for an org that predates the
   * migration. Armed wholesale by `/__test__/agent-teams`.
   */
  agentTeams: FakeAgentTeam[];
  /**
   * teamId -> its EXPLICIT membership rows. The default team never holds any
   * (everyone belongs to it implicitly), which is why both member writes on it
   * are refused with `400 default_team`.
   */
  agentTeamMembers: Map<string, FakeAgentTeamMember[]>;
  /**
   * agentId -> the team it belongs to. An ABSENT entry resolves to the default
   * team, mirroring the NULL `agents.team_id` the gateway reads that way: no
   * agent is ever teamless, and deleting a team needs no sweep.
   */
  agentTeamOf: Map<string, string>;
  /**
   * C13 personal space: `GET /v1/org/teams` serves the default team alone and
   * every team mutation answers `403 personal_space`. Armed by
   * `/__test__/agent-teams` `{personalSpace:true}`.
   */
  personalSpace: boolean;
  /** Monotonic counter for minted agent-team ids (`POST /v1/org/teams`). */
  agentTeamSeq: number;
  /** connectionId -> the acting user's connected account. */
  connections: Map<string, IntegrationConnection>;
  /** Per-user preference key -> value (locale, timezone, …). */
  preferences: Map<string, string>;
  /**
   * workspaceId -> the sidebar's order + grouping (real host persists it as the
   * `sidebar_layout` workspace preference). A missing key reads as the default.
   */
  sidebarLayouts: Map<string, SidebarLayout>;
  /** Monotonic counter for minted connection ids. */
  connSeq: number;
}

export function fileKey(agentId: string, relPath: string): string {
  return `${agentId}:${relPath}`;
}

function freshState(): HostState {
  const files = new Map<string, string>();
  files.set(
    fileKey(SEED_AGENT_ID, ACTIVITY_PATH),
    JSON.stringify(SEED_ACTIVITIES),
  );
  files.set(
    fileKey(SEED_AGENT_ID, LEARNINGS_PATH),
    JSON.stringify(SEED_LEARNINGS),
  );
  // Two seeded workspace files so the Files tab has rows on first paint.
  const workspace = new Map<
    string,
    { bytes: Buffer; created: number; modified: number }
  >();
  workspace.set(fileKey(SEED_AGENT_ID, "Q3 report.pdf"), {
    bytes: Buffer.from("PDF-BYTES"),
    created: EPOCH,
    modified: EPOCH + 86_400_000,
  });
  workspace.set(fileKey(SEED_AGENT_ID, "Docs/sales.csv"), {
    bytes: Buffer.from("a,b\n1,2\n"),
    created: EPOCH,
    modified: EPOCH,
  });
  // One seeded active connection so the connections list has a row on first read.
  const connections = new Map<string, IntegrationConnection>([
    [
      "conn-gmail-0",
      { toolkit: "gmail", connectionId: "conn-gmail-0", status: "active" },
    ],
  ]);
  return {
    agents: [
      {
        id: SEED_AGENT_ID,
        workspaceId: SEED_WORKSPACE_ID,
        name: SEED_AGENT_NAME,
        createdAt: EPOCH,
      },
    ],
    files,
    workspace,
    histories: new Map(),
    agentSeq: 1,
    activitySeq: 2,
    routineSeq: 0,
    capabilities: { ...DEFAULT_CAPABILITIES },
    teamsSettings: { ...DEFAULT_TEAMS_SETTINGS },
    computeUsage: null,
    integrationsMode: "ready",
    agentReadHoldMs: 0,
    failingAgentReads: new Set<string>(),
    failingAgentReadSegments: null,
    customIntegrations: null,
    orgMembers: null,
    meProfileBase: {},
    meProfileCustom: { displayName: null, photoUrl: null },
    orgInvites: [],
    inviteSeq: 0,
    teamWorkspaces: [],
    spaceInvites: [],
    teamSeq: 0,
    agentTeams: [],
    agentTeamMembers: new Map(),
    agentTeamOf: new Map(),
    personalSpace: false,
    agentTeamSeq: 0,
    connections,
    preferences: new Map(),
    sidebarLayouts: new Map(),
    connSeq: 1,
  };
}

export let state: HostState = freshState();

/** Arm (or clear, with 0) the cold-start hold on per-agent reads. */
export function setAgentReadHoldMs(ms: number): void {
  state.agentReadHoldMs = Math.max(0, ms);
}

/**
 * Arm (or clear, with `[]`) the agents whose per-agent reads answer 500.
 * `segments` narrows it to named sub-resources (`["routine_runs"]`); omitting
 * it fails every read those agents serve.
 */
export function setFailingAgentReads(
  agentIds: string[],
  segments?: string[] | null,
): void {
  state.failingAgentReads = new Set(agentIds);
  state.failingAgentReadSegments =
    segments && segments.length > 0 ? new Set(segments) : null;
}

/**
 * Rewind the routine-id counter, so the NEXT routine created on ANY agent takes
 * an id an earlier agent already used. Routine ids are unique per agent in the
 * real host, never per workspace, so this collision is ordinary production
 * truth — the fake's one global counter is what would otherwise hide it, and a
 * spec asserting cross-agent routing has to be able to reproduce it.
 */
export function setRoutineSeq(next: number): void {
  state.routineSeq = Math.max(0, next);
}

/** Restore the seed. Called by the harness before each test. */
export function reset(): void {
  state = freshState();
  resetProviders();
  resetSharedSkills();
  resetSkills();
  domainListeners.clear();
}

// ---- domain reactivity (the /v1/events feed) ----
type DomainListener = (event: {
  type: string;
  agentPath?: string;
  workspaceId?: string;
}) => void;
const domainListeners = new Set<DomainListener>();

export function onDomainEvent(fn: DomainListener): () => void {
  domainListeners.add(fn);
  return () => domainListeners.delete(fn);
}
export function emitDomain(
  type: string,
  agentPath?: string,
  workspaceId = SEED_WORKSPACE_ID,
): void {
  for (const fn of domainListeners) fn({ type, agentPath, workspaceId });
}
/** Public emit, used by the `/__test__/emit` control route to drive reactivity. */
export function emit(type: string, agentPath?: string): void {
  emitDomain(type, agentPath);
}

export const seedUsage = SEED_USAGE;
