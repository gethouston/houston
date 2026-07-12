import { existsSync, readFileSync } from "node:fs";
import type { AgentId } from "../domain/types";
import { agentDotHoustonFile, atomicWriteJson } from "./agent-file";

/**
 * Per-agent integration grants (LOCAL / self-host only). A grant record answers
 * "which of the user's connected toolkits may THIS agent use". The record's mere
 * EXISTENCE is load-bearing: no record means backward-compatible "every connected
 * app" (no filtering); once a record exists the sandbox proxy enforces it.
 *
 * Modeled as a discriminated union rather than a bare array so "never written"
 * (materialize the default) is never confused with "written empty" (deny all).
 */
export type GrantRecord =
  | { stored: true; toolkits: string[] }
  | { stored: false };

export interface IntegrationGrantStore {
  /** The agent's stored grant record, or `{stored:false}` when none was written. */
  get(agentId: AgentId): Promise<GrantRecord>;
  /** Replace (or create) the agent's grant set. Callers pass a validated set. */
  put(agentId: AgentId, toolkits: string[]): Promise<void>;
}

/** In-memory store for tests + dev. */
export class MemoryIntegrationGrantStore implements IntegrationGrantStore {
  private readonly byAgent = new Map<AgentId, string[]>();

  async get(agentId: AgentId): Promise<GrantRecord> {
    const toolkits = this.byAgent.get(agentId);
    return toolkits
      ? { stored: true, toolkits: [...toolkits] }
      : { stored: false };
  }

  async put(agentId: AgentId, toolkits: string[]): Promise<void> {
    this.byAgent.set(agentId, [...toolkits]);
  }
}

/**
 * File-backed store for the desktop tree: the record lives INSIDE the agent's own
 * directory (`<workspacesRoot>/<Workspace>/<Agent>/.houston/integration-grants.json`),
 * so it survives restarts and is removed for free when the agent dir is deleted —
 * no separate cleanup on the delete flow. A missing or corrupt file reads as
 * `{stored:false}` (re-materialize), never a boot/read crash.
 */
export class FileIntegrationGrantStore implements IntegrationGrantStore {
  constructor(private readonly workspacesRoot: string) {}

  /** `<root>/<Workspace>/<Agent>/.houston/integration-grants.json`, or null on a bad id. */
  private fileFor(agentId: AgentId): string | null {
    return agentDotHoustonFile(
      this.workspacesRoot,
      agentId,
      "integration-grants.json",
    );
  }

  async get(agentId: AgentId): Promise<GrantRecord> {
    const path = this.fileFor(agentId);
    if (!path || !existsSync(path)) return { stored: false };
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        toolkits?: unknown;
      };
      if (
        Array.isArray(parsed.toolkits) &&
        parsed.toolkits.every((t) => typeof t === "string")
      ) {
        return { stored: true, toolkits: parsed.toolkits as string[] };
      }
    } catch {
      // Corrupt/partial file → treat as absent so a later read re-materializes.
    }
    return { stored: false };
  }

  async put(agentId: AgentId, toolkits: string[]): Promise<void> {
    const path = this.fileFor(agentId);
    if (!path)
      throw new Error(`integration grants: invalid agent id '${agentId}'`);
    atomicWriteJson(path, { toolkits });
  }
}
