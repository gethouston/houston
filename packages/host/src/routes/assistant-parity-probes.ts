/**
 * The catalog operations the parity probe drives against a real local host,
 * and the ones it deliberately does not.
 *
 * The generated catalog describes ONE surface that the local host and the
 * hosted gateway both serve. This table is how that claim stays true: every
 * probe names an operation, the arguments to dispatch it with, and whether the
 * local host is expected to answer it at all.
 */

/** The agent and workspace the probe's temporary host is seeded with. */
export const PROBE_AGENT = "Work/Sales";
export const PROBE_WORKSPACE = "Work";

export interface Probe {
  operation: string;
  params: Record<string, unknown>;
}

/**
 * A representative operation from every family the local host serves. Reads,
 * plus the preference writes (locale, agent color): a probe asserts the ADDRESS
 * resolves to a live handler, and a destructive call would prove nothing extra.
 */
export const LOCAL_PROBES: readonly Probe[] = [
  { operation: "listWorkspaces", params: {} },
  {
    operation: "getHostSidebarLayout",
    params: { workspaceId: PROBE_WORKSPACE },
  },
  { operation: "getPreference", params: { key: "locale" } },
  { operation: "setPreference", params: { key: "locale", value: "en" } },
  { operation: "listAgents", params: {} },
  { operation: "listInstalledConfigs", params: {} },
  {
    operation: "updateAgentColor",
    params: { agentId: PROBE_AGENT, color: "teal" },
  },
  { operation: "listActivities", params: { agentId: PROBE_AGENT } },
  {
    operation: "updateActivity",
    params: { agentId: PROBE_AGENT, id: "no-such-activity", updates: {} },
  },
  { operation: "listRoutines", params: { agentId: PROBE_AGENT } },
  { operation: "listRoutineRuns", params: { agentId: PROBE_AGENT } },
  {
    operation: "runRoutineNow",
    params: { agentId: PROBE_AGENT, id: "no-such-routine" },
  },
  { operation: "listSkills", params: { agentId: PROBE_AGENT } },
  { operation: "getSkillsManifest", params: { agentId: PROBE_AGENT } },
  { operation: "listSharedSkills", params: { workspaceId: PROBE_WORKSPACE } },
  {
    operation: "readAgentFile",
    params: { agentId: PROBE_AGENT, relPath: "config.json" },
  },
  { operation: "listProjectFiles", params: { agentPath: PROBE_AGENT } },
  {
    operation: "readProjectFile",
    params: { agentPath: PROBE_AGENT, relPath: "CLAUDE.md" },
  },
  { operation: "integrationStatus", params: {} },
];

/**
 * Operations the local host legitimately does not serve, each with the reason.
 * They are asserted to MISS — a cloud-only path that starts resolving locally
 * means the two surfaces drifted and this list is stale.
 */
export const CLOUD_ONLY_PROBES: readonly (Probe & { reason: string })[] = [
  {
    operation: "getOrg",
    params: {},
    reason: "spaces and their membership exist only on the hosted gateway",
  },
  {
    operation: "listOrgs",
    params: {},
    reason: "a local host has no account with more than one space",
  },
  {
    operation: "getBilling",
    params: {},
    reason: "billing is a hosted-subscription concern",
  },
  {
    operation: "listApiKeys",
    params: {},
    reason: "personal API keys authenticate against the hosted public API",
  },
  {
    operation: "getMyProfile",
    params: {},
    reason: "the display profile comes from the hosted identity provider",
  },
  {
    operation: "getAgentSettings",
    params: { agentSlugOrId: PROBE_AGENT },
    reason: "manager-set per-agent ceilings are a Teams surface",
  },
  {
    operation: "agentTriggerStatus",
    params: { agentSlugOrId: PROBE_AGENT },
    reason: "the gateway owns trigger subscriptions",
  },
];
