import {
  PROBE_AGENT,
  PROBE_FOLDER,
  PROBE_FOLDER_RENAMED,
  PROBE_WORKSPACE,
  type Probe,
  probe,
} from "./assistant-parity-probes";

/**
 * Every operation the local host answers, with the arguments to dispatch it.
 *
 * A probe asserts the ADDRESS resolves to a live handler that authored its own
 * answer — not that the call succeeds. So writes address things that do not
 * exist ("no-such-routine") or that the probes themselves own (the folder
 * below): the handler's own 404 or 400 proves the route as well as a 200 does,
 * and nothing the agent seeded is destroyed.
 *
 * ORDER MATTERS for the Files block: it creates one folder, renames it, moves
 * it and deletes it, in that sequence, so each route acts on something real.
 */
const AGENT = { agentId: PROBE_AGENT };
const AGENT_PATH = { agentPath: PROBE_AGENT };
const WORKSPACE = { workspaceId: PROBE_WORKSPACE };
const NO_SKILL = "no-such-skill";
const NO_ROUTINE = "no-such-routine";

export const LOCAL_PROBES: readonly Probe[] = [
  // Account and agents.
  probe("listWorkspaces"),
  probe("getHostSidebarLayout", WORKSPACE),
  probe("getPreference", { key: "locale" }),
  probe("setPreference", { key: "locale", value: "en" }),
  probe("listAgents"),
  probe("listInstalledConfigs"),
  probe("updateAgentColor", { agentId: PROBE_AGENT, color: "teal" }),
  probe("listAgentProviders", AGENT, {
    status: 503,
    reason: "the probe host's agent has no runtime up to list providers from",
  }),
  probe(
    "installAgentFromGithub",
    { githubUrl: "not-a-github-url" },
    {
      status: 503,
      reason:
        "a host seeded with nothing has no agent-config library to install from",
    },
  ),

  // Missions and routines.
  probe("listActivities", AGENT),
  probe("updateActivity", {
    ...AGENT,
    id: "no-such-activity",
    updates: {},
  }),
  probe("listRoutines", AGENT),
  probe("listRoutineRuns", AGENT),
  probe("createRoutine", { ...AGENT, input: {} }),
  probe("updateRoutine", { ...AGENT, id: NO_ROUTINE, updates: {} }),
  probe("deleteRoutine", { ...AGENT, id: NO_ROUTINE }),
  probe("runRoutineNow", { ...AGENT, id: NO_ROUTINE }),
  probe("cancelRoutineRun", {
    ...AGENT,
    routineId: NO_ROUTINE,
    runId: "no-such-run",
  }),

  // Skills, per agent and shared across the workspace.
  probe("listSkills", AGENT),
  probe("loadSkill", { ...AGENT, slug: NO_SKILL }),
  probe("createSkill", { ...AGENT, body: {} }),
  probe("saveSkill", { ...AGENT, slug: NO_SKILL, content: "x" }),
  probe("deleteSkill", { ...AGENT, slug: NO_SKILL }),
  probe("getSkillsManifest", AGENT),
  probe("putSkillsManifest", {
    ...AGENT,
    manifest: { version: 1, enabled: [] },
  }),
  probe("searchCommunitySkills", { ...AGENT, query: "" }),
  probe("previewCommunitySkill", { ...AGENT, source: "", skillId: "" }),
  probe("installCommunitySkill", { ...AGENT, body: {} }),
  probe("listSkillsFromRepo", { ...AGENT, source: "" }),
  probe("installSkillsFromRepo", { ...AGENT, body: {} }),
  probe("listSharedSkills", WORKSPACE),
  probe("loadSharedSkill", { ...WORKSPACE, slug: NO_SKILL }),
  probe("createSharedSkill", { ...WORKSPACE, body: {} }),
  probe("saveSharedSkill", { ...WORKSPACE, slug: NO_SKILL, content: "x" }),
  probe("promoteSharedSkill", { ...WORKSPACE, slug: NO_SKILL, content: "x" }),
  probe("deleteSharedSkill", { ...WORKSPACE, slug: NO_SKILL }),

  // The agent's own `.houston` documents.
  probe("readAgentFile", { ...AGENT, relPath: "config.json" }),
  probe("writeAgentFile", {
    ...AGENT,
    relPath: "parity-probe.json",
    content: "{}",
  }),

  // The Files tab, as one ordered sequence over a folder the probes own.
  probe("readProjectFile", { ...AGENT_PATH, relPath: "CLAUDE.md" }),
  probe("createFolder", { ...AGENT_PATH, folderName: PROBE_FOLDER }),
  probe("renameFile", {
    ...AGENT_PATH,
    relPath: PROBE_FOLDER,
    newName: PROBE_FOLDER_RENAMED,
  }),
  probe("moveProjectFile", {
    ...AGENT_PATH,
    relPath: PROBE_FOLDER_RENAMED,
    toDir: null,
  }),
  probe("listProjectFiles", AGENT_PATH),
  probe("deleteFile", { ...AGENT_PATH, relPath: PROBE_FOLDER_RENAMED }),

  // Integrations, including the ones a user adds themselves.
  probe("integrationStatus"),
  probe("integrationToolkits", { provider: "composio" }),
  probe("integrationConnections", { provider: "composio" }),
  probe("integrationConnection", {
    provider: "composio",
    connectionId: "no-such-connection",
  }),
  probe("triggerTypes", { toolkit: "gmail" }),
  probe("customIntegrations"),
  probe("addCustomIntegration", { input: {} }),
  probe("detectCustomIntegration", { url: "not-a-url" }),
  probe("customIntegrationTools", { slug: "no-such-integration" }),
  probe("removeCustomIntegration", { slug: "no-such-integration" }),
];
