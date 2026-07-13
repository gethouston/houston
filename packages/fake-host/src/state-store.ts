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

import type { Activity, Capabilities, SidebarLayout } from "@houston/protocol";
import type {
  ChatMessage,
  IntegrationConnection,
  TokenUsage,
} from "@houston/runtime-client";
import { SEED_AGENT_ID, SEED_AGENT_NAME, SEED_WORKSPACE_ID } from "./config";
import { resetProviders } from "./state-providers";
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
  displayUrl?: string;
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
};

/** A caller's effective per-agent access (Teams v2). Mirrors the wire enum. */
export type AgentAccess = "manager" | "user";

/**
 * The Teams v2 settings the gateway serves at `/v1/agents/:slug/settings` and
 * `/v1/org/settings`: the agent + org integration ceilings (`null` =
 * unrestricted, `[]` = none), the agent's AI-model ceiling, and the caller's
 * effective agent access. Seeded unrestricted; armed by `/__test__/agent-settings`.
 */
export interface TeamsSettings {
  allowedToolkits: string[] | null;
  orgAllowedToolkits: string[] | null;
  allowedModels: string[] | null;
  orgAllowedModels: string[] | null;
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
};

/** Unrestricted, manager access — no policy until a spec arms one. */
export const DEFAULT_TEAMS_SETTINGS: TeamsSettings = {
  allowedToolkits: null,
  orgAllowedToolkits: null,
  allowedModels: null,
  orgAllowedModels: null,
  access: "manager",
};

/** The host's agent wire model, mapped to the UI `Agent` by control-plane.ts. */
export interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
}

export const ACTIVITY_PATH = ".houston/activity/activity.json";
export const ROUTINES_PATH = ".houston/routines/routines.json";
export const SEED_USAGE: TokenUsage = {
  context_tokens: 1200,
  output_tokens: 80,
  cached_tokens: 0,
};
export const EPOCH = Date.UTC(2024, 0, 1);
export const ISO = new Date(EPOCH).toISOString();

const SEED_ACTIVITIES: Activity[] = [
  {
    id: "act-1",
    title: "Plan a trip to Tokyo",
    description: "Research flights and hotels for the spring",
    status: "needs_you",
    updated_at: ISO,
  },
  {
    id: "act-2",
    title: "Draft the launch email",
    description: "Write the beta announcement to the waitlist",
    status: "done",
    updated_at: ISO,
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
  /** Monotonic counter for minted routine ids. */
  routineSeq: number;
  // ── user-scoped gateway state (integrations, grants, preferences) ──
  /** Advertised capabilities, armed by `/__test__/capabilities` (Teams e2e). */
  capabilities: FakeCapabilities;
  /** Teams v2 integration/model ceilings, armed by `/__test__/agent-settings`. */
  teamsSettings: TeamsSettings;
  /** Composio readiness, toggled by the `/__test__/integrations-mode` control. */
  integrationsMode: IntegrationsMode;
  /**
   * Custom integrations (HOU-550), armed by `/__test__/custom-integrations`.
   * `null` (the default) = the host does not serve the feature at all: no
   * `custom` entry in the readiness list and the definitions routes 404 (the
   * client degrades to hiding every custom surface). A present array (even
   * empty) = the key-free custom provider is wired and ready.
   */
  customIntegrations: CustomIntegrationSeed[] | null;
  /** connectionId -> the acting user's connected account. */
  connections: Map<string, IntegrationConnection>;
  /**
   * agentId -> granted toolkit slugs. PRESENCE is the record: a missing key
   * means "no grants record" → GET 404 → the client degrades to `null`; a
   * present key (even `[]`) means "record exists" → GET `{toolkits}`.
   */
  grants: Map<string, string[]>;
  /** Per-user preference key -> value (locale, timezone, …). */
  preferences: Map<string, string>;
  /**
   * agentId -> integration action approvals: `always` action slugs the user
   * blessed for any params, and one-shot `tickets` (params-fingerprint hashes,
   * consumed once). Mirrors the real host's ApprovalRecord minus the TTL the
   * fake host never needs. A missing key reads as the empty record.
   */
  actionApprovals: Map<string, { always: string[]; tickets: string[] }>;
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
    integrationsMode: "ready",
    customIntegrations: null,
    connections,
    // No seeded grants record: the seed agent starts "grants unsupported" (404 →
    // null), so a suite can assert the null→[] distinction by writing one.
    grants: new Map(),
    preferences: new Map(),
    actionApprovals: new Map(),
    sidebarLayouts: new Map(),
    connSeq: 1,
  };
}

export let state: HostState = freshState();

/** Restore the seed. Called by the harness before each test. */
export function reset(): void {
  state = freshState();
  resetProviders();
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
export function emitDomain(type: string, agentPath?: string): void {
  for (const fn of domainListeners)
    fn({ type, agentPath, workspaceId: SEED_WORKSPACE_ID });
}
/** Public emit, used by the `/__test__/emit` control route to drive reactivity. */
export function emit(type: string, agentPath?: string): void {
  emitDomain(type, agentPath);
}

export const seedUsage = SEED_USAGE;
