import { existsSync, readFileSync } from "node:fs";
import type { AgentId } from "../domain/types";
import { agentDotHoustonFile, atomicWriteJson } from "./agent-file";

/**
 * Per-agent action-approval state (LOCAL / self-host + managed pods). Records
 * which integration ACTIONS the user has blessed for THIS agent:
 *   - `always`: action slugs the user chose "Always allow" for (any params).
 *   - `tickets`: one-shot "Allow once" grants, each a params-fingerprint hash
 *     with the ts it was written; consumed on the matching execute, TTL-pruned.
 * An empty record `{always:[], tickets:[]}` means "nothing pre-approved" — the
 * gate then asks. Distinct from integration GRANTS (which toolkit an agent may
 * touch at all); approvals gate the individual action call.
 */
export interface ApprovalRecord {
  always: string[];
  tickets: { hash: string; ts: number }[];
}

/** The empty record — the safe read for a missing/corrupt file (never a crash). */
export const EMPTY_APPROVAL_RECORD: ApprovalRecord = {
  always: [],
  tickets: [],
};

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
 * the agent dir is deleted — no separate cleanup on the delete flow. A missing
 * or corrupt file reads as the empty record (re-materialize), never a crash.
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
        always?: unknown;
        tickets?: unknown;
      };
      const always =
        Array.isArray(parsed.always) &&
        parsed.always.every((a) => typeof a === "string")
          ? (parsed.always as string[])
          : [];
      const tickets =
        Array.isArray(parsed.tickets) &&
        parsed.tickets.every(
          (t) =>
            t &&
            typeof t === "object" &&
            typeof (t as { hash?: unknown }).hash === "string" &&
            typeof (t as { ts?: unknown }).ts === "number",
        )
          ? (parsed.tickets as { hash: string; ts: number }[])
          : [];
      return { always, tickets };
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
  return {
    always: [...record.always],
    tickets: record.tickets.map((t) => ({ ...t })),
  };
}
