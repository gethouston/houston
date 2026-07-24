import { existsSync, readFileSync } from "node:fs";
import type { AgentId } from "../domain/types";
import { agentDotHoustonFile, atomicWriteJson } from "./agent-file";

/**
 * Per-agent action-approval state (LOCAL / self-host + managed pods). Records
 * which integration ACTIONS the user has confirmed for THIS agent: each grant
 * is an action slug with the ts it was blessed. Confirming an action ("Do it")
 * grants that SLUG for a short window (GRANT_TTL_MS), so a batch — "send 30
 * invites" — or a chained draft→send flow does not re-ask per call. An empty
 * record `{grants:[]}` means "nothing confirmed" — the gate then asks. Distinct
 * from integration GRANTS (which toolkit an agent may touch at all); approvals
 * gate the individual action call.
 */
export interface ApprovalRecord {
  grants: { action: string; ts: number }[];
}

/** The empty record — the safe read for a missing/corrupt/legacy file. */
export const EMPTY_APPROVAL_RECORD: ApprovalRecord = { grants: [] };

export interface ActionApprovalStore {
  /** The agent's stored approval record, or the empty record when none exists. */
  get(agentId: AgentId): Promise<ApprovalRecord>;
  /** Replace the agent's approval record (callers pass a pruned, validated one). */
  put(agentId: AgentId, record: ApprovalRecord): Promise<void>;
}

/** In-memory store for tests + dev. */
export class MemoryActionApprovalStore implements ActionApprovalStore {
  private readonly byAgent = new Map<AgentId, ApprovalRecord>();

  async get(agentId: AgentId): Promise<ApprovalRecord> {
    const record = this.byAgent.get(agentId);
    return record ? clone(record) : clone(EMPTY_APPROVAL_RECORD);
  }

  async put(agentId: AgentId, record: ApprovalRecord): Promise<void> {
    this.byAgent.set(agentId, clone(record));
  }
}

/**
 * File-backed store for the desktop/pod tree: the record lives INSIDE the
 * agent's own directory (`<workspacesRoot>/<Workspace>/<Agent>/.houston/
 * action-approvals.json`), so it survives restarts and is removed for free when
 * the agent dir is deleted — no separate cleanup on the delete flow. A missing,
 * corrupt, OR legacy-shaped file (the deleted `{always, tickets}` model) reads
 * as the empty record, never a crash.
 */
export class FileActionApprovalStore implements ActionApprovalStore {
  constructor(private readonly workspacesRoot: string) {}

  /** `<root>/<Workspace>/<Agent>/.houston/action-approvals.json`, or null on a bad id. */
  private fileFor(agentId: AgentId): string | null {
    return agentDotHoustonFile(
      this.workspacesRoot,
      agentId,
      "action-approvals.json",
    );
  }

  async get(agentId: AgentId): Promise<ApprovalRecord> {
    const path = this.fileFor(agentId);
    if (!path || !existsSync(path)) return clone(EMPTY_APPROVAL_RECORD);
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        grants?: unknown;
      };
      // Tolerant reader (beta, feature reshaped): only the new `grants` array is
      // honored — a legacy `{always, tickets}` file has no `grants` and reads
      // as empty, dropping the old model harmlessly.
      const grants =
        Array.isArray(parsed.grants) &&
        parsed.grants.every(
          (g) =>
            g &&
            typeof g === "object" &&
            typeof (g as { action?: unknown }).action === "string" &&
            typeof (g as { ts?: unknown }).ts === "number",
        )
          ? (parsed.grants as { action: string; ts: number }[])
          : [];
      return { grants };
    } catch {
      // Corrupt/partial file → empty record so a later write re-materializes.
      return clone(EMPTY_APPROVAL_RECORD);
    }
  }

  async put(agentId: AgentId, record: ApprovalRecord): Promise<void> {
    const path = this.fileFor(agentId);
    if (!path)
      throw new Error(`action approvals: invalid agent id '${agentId}'`);
    atomicWriteJson(path, record);
  }
}

function clone(record: ApprovalRecord): ApprovalRecord {
  return { grants: record.grants.map((g) => ({ ...g })) };
}
