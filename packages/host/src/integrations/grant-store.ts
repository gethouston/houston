import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AgentId } from "../domain/types";

/**
 * One granted connected account: the unit of a grant is now a specific CONNECTED
 * ACCOUNT (a `connectionId`), not a whole toolkit — a user may hold several
 * accounts for the same app (two Gmails) and grant them to agents independently.
 * The `toolkit` is captured alongside so enforcement can derive the granted
 * toolkit set without a provider round-trip.
 */
export interface GrantAccount {
  connectionId: string;
  toolkit: string;
}

/**
 * Per-agent integration grants (LOCAL / self-host only). A grant record answers
 * "which of the user's connected accounts may THIS agent use". The record's mere
 * EXISTENCE is load-bearing: no record means backward-compatible "every connected
 * account" (materialize the default); once a record exists the sandbox proxy
 * enforces it.
 *
 * Modeled as a discriminated union rather than a bare array so "never written"
 * (materialize the default) is never confused with "written empty" (deny all). A
 * legacy `{ toolkits }` file (the v1 toolkit-granted shape) reads as NOT stored
 * but carries `legacyToolkits` so the first read materializes the connected
 * accounts of exactly those toolkits (a one-time upgrade), not all of them.
 */
export type GrantRecord =
  | { stored: true; accounts: GrantAccount[] }
  | { stored: false; legacyToolkits?: string[] };

export interface IntegrationGrantStore {
  /** The agent's stored grant record, or `{stored:false}` when none was written. */
  get(agentId: AgentId): Promise<GrantRecord>;
  /** Replace (or create) the agent's grant set. Callers pass a validated set. */
  put(agentId: AgentId, accounts: GrantAccount[]): Promise<void>;
}

function isGrantAccount(value: unknown): value is GrantAccount {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.connectionId === "string" && typeof v.toolkit === "string";
}

/** In-memory store for tests + dev. */
export class MemoryIntegrationGrantStore implements IntegrationGrantStore {
  private readonly byAgent = new Map<AgentId, GrantAccount[]>();

  async get(agentId: AgentId): Promise<GrantRecord> {
    const accounts = this.byAgent.get(agentId);
    return accounts
      ? { stored: true, accounts: accounts.map((a) => ({ ...a })) }
      : { stored: false };
  }

  async put(agentId: AgentId, accounts: GrantAccount[]): Promise<void> {
    this.byAgent.set(
      agentId,
      accounts.map((a) => ({ ...a })),
    );
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
    if (agentId.includes("..")) return null;
    const parts = agentId.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return join(
      this.workspacesRoot,
      parts[0],
      parts[1],
      ".houston",
      "integration-grants.json",
    );
  }

  async get(agentId: AgentId): Promise<GrantRecord> {
    const path = this.fileFor(agentId);
    if (!path || !existsSync(path)) return { stored: false };
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        accounts?: unknown;
        toolkits?: unknown;
      };
      if (
        Array.isArray(parsed.accounts) &&
        parsed.accounts.every(isGrantAccount)
      ) {
        return { stored: true, accounts: parsed.accounts };
      }
      // Legacy v1 shape: a toolkit-granted file. Read as no-record but carry the
      // toolkits so the first read materializes their connected accounts once.
      if (
        Array.isArray(parsed.toolkits) &&
        parsed.toolkits.every((t) => typeof t === "string")
      ) {
        return { stored: false, legacyToolkits: parsed.toolkits as string[] };
      }
    } catch {
      // Corrupt/partial file → treat as absent so a later read re-materializes.
    }
    return { stored: false };
  }

  async put(agentId: AgentId, accounts: GrantAccount[]): Promise<void> {
    const path = this.fileFor(agentId);
    if (!path)
      throw new Error(`integration grants: invalid agent id '${agentId}'`);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ accounts }, null, 2));
    renameSync(tmp, path); // atomic swap
  }
}
