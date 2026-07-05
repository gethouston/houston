// Per-agent config + host-level preferences.

export interface AgentConfig {
  name?: string;
  provider?: string;
  model?: string;
  effort?: string;
  [extra: string]: unknown;
}

/**
 * One entry of the installed agent-config library — a `houston.json` template
 * the user added (e.g. from a GitHub repo) that the create-agent picker merges
 * alongside the bundled first-party templates. `config` is the raw manifest
 * (id/name/description/claudeMd/agentSeeds/…, authored outside this repo, so
 * untyped here); `path` is the library key the entry lives under.
 */
export interface InstalledAgentConfig {
  config: Record<string, unknown>;
  path: string;
}

export interface PreferenceValue {
  value: string | null;
}

/** Well-known preference keys (free-form strings remain allowed). */
export type KnownPreferenceKey = "timezone" | "locale" | "legal_acceptance";

/**
 * JSON-encoded value of the "legal_acceptance" preference. The frontend
 * re-prompts whenever the stored version is lower than the in-app constant.
 */
export interface LegalAcceptance {
  version: number;
  /** RFC3339 timestamp captured at acceptance. */
  acceptedAt: string;
}

export const LEGAL_ACCEPTANCE_KEY = "legal_acceptance";
