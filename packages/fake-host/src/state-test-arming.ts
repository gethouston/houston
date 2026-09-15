/**
 * The FAULTS a spec arms through `/__test__/*`, kept apart from the host state
 * they act on.
 *
 * Everything here models the deployment misbehaving rather than the data it
 * serves: a pod still waking, a pod unreachable, a workspace whose storage
 * refuses writes. Nothing in it is ever served as content, so it does not
 * belong in the seed a `reset()` rebuilds — `resetArming()` disarms it there
 * instead, and a reader of `state-store.ts` sees only the world the fake
 * describes, not the ways a spec can break it.
 */

export interface TestArming {
  /**
   * Cold-start hold (ms) on per-agent reads, armed by
   * `/__test__/hold-agent-reads`. Models the cloud gateway's `ensureAwake`
   * hold: every `GET /agents/:id/*` stalls this long before answering, the way
   * an asleep pod's reads stall until it wakes. `0` (the disarmed state)
   * answers instantly.
   */
  agentReadHoldMs: number;
  /**
   * Agent ids whose per-agent READS answer `500`, armed by
   * `/__test__/fail-agent-reads`. Models the half-broken fleet the cross-agent
   * sweep must survive (HOU-981): one agent's pod is unreachable while every
   * other agent answers normally. Empty (the disarmed state) = every agent is
   * healthy.
   */
  failingAgentReads: Set<string>;
  /**
   * Which sub-resources of those agents fail (`routines`, `routine_runs`,
   * `activities`, `files`, ...). `null` = the whole pod is unreachable, every
   * read 500s. A NAMED set is the subtler half-broken state a surface must also
   * survive: one route down while the rest of that same agent answers, e.g.
   * routines fine and their run history 500ing, which leaves every row without
   * its last-run line.
   */
  failingAgentReadSegments: Set<string> | null;
  /**
   * Agent ids whose workspace refuses every files WRITE with the host's
   * `403 read_only`, armed by `/__test__/workspace-read-only`. Models the real
   * host's refusal when the workspace folder answers EACCES/EPERM/EROFS (the
   * vfs raises `VfsReadOnlyError`, `turn/files.ts` names it): a read-only
   * mount, a folder whose permissions were revoked. Empty (the disarmed state)
   * = every workspace is writable. READS keep answering: the folder is
   * unwritable, not unreadable, which is exactly the state the Files tab has
   * to explain.
   */
  readOnlyWorkspaces: Set<string>;
}

const disarmed = (): TestArming => ({
  agentReadHoldMs: 0,
  failingAgentReads: new Set<string>(),
  failingAgentReadSegments: null,
  readOnlyWorkspaces: new Set<string>(),
});

export let arming: TestArming = disarmed();

/** Disarm every fault. Called by `reset()` before each test. */
export function resetArming(): void {
  arming = disarmed();
}

/** Arm (or clear, with 0) the cold-start hold on per-agent reads. */
export function setAgentReadHoldMs(ms: number): void {
  arming.agentReadHoldMs = Math.max(0, ms);
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
  arming.failingAgentReads = new Set(agentIds);
  arming.failingAgentReadSegments =
    segments && segments.length > 0 ? new Set(segments) : null;
}

/**
 * Arm (or clear, with `[]`) the agent workspaces whose files writes answer
 * `403 read_only`.
 */
export function setReadOnlyWorkspaces(agentIds: string[]): void {
  arming.readOnlyWorkspaces = new Set(agentIds);
}

/** True when this agent's workspace was armed to refuse writes. */
export function isWorkspaceReadOnly(agentId: string): boolean {
  return arming.readOnlyWorkspaces.has(agentId);
}
