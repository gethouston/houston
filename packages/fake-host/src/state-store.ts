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

import type { Activity } from "@houston/protocol";
import type {
  ChatMessage,
  IntegrationConnection,
  TokenUsage,
} from "@houston/runtime-client";
import { SEED_AGENT_ID, SEED_AGENT_NAME, SEED_WORKSPACE_ID } from "./config";
import { resetProviders } from "./state-providers";

/**
 * Gateway integrations readiness, toggled by `/__test__/integrations-mode`:
 *  - `ready` — a Composio key is configured (the default),
 *  - `unavailable` — no key → every integrations route 503s,
 *  - `signin` — the provider reports `ready:false, reason:"signin"`.
 */
export type IntegrationsMode = "ready" | "unavailable" | "signin";

/** The host's agent wire model, mapped to the UI `Agent` by control-plane.ts. */
export interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
}

export const ACTIVITY_PATH = ".houston/activity/activity.json";
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
  // ── user-scoped gateway state (integrations, grants, preferences) ──
  /** Composio readiness, toggled by the `/__test__/integrations-mode` control. */
  integrationsMode: IntegrationsMode;
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
    integrationsMode: "ready",
    connections,
    // No seeded grants record: the seed agent starts "grants unsupported" (404 →
    // null), so a suite can assert the null→[] distinction by writing one.
    grants: new Map(),
    preferences: new Map(),
    connSeq: 1,
  };
}

export let state: HostState = freshState();

/** Restore the seed. Called by the harness before each test. */
export function reset(): void {
  state = freshState();
  resetProviders();
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
