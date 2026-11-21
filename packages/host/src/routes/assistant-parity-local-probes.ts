import { LOCAL_INTEGRATION_PROBES } from "./assistant-parity-local-integrations";
import {
  PROBE_AGENT,
  PROBE_FOLDER,
  PROBE_FOLDER_RENAMED,
  PROBE_WORKSPACE,
  type Probe,
  probe,
  proxied,
} from "./assistant-parity-probes";

const AGENT = { agentId: PROBE_AGENT };
const AGENT_PATH = { agentPath: PROBE_AGENT };
const WORKSPACE = { workspaceId: PROBE_WORKSPACE };
const NO_SKILL = "no-such-skill";
const NO_ROUTINE = "no-such-routine";

export const LOCAL_PROBES: readonly Probe[] = [
  probe("getCapabilities"),
  probe("listWorkspaces"),
  probe("getHostSidebarLayout", WORKSPACE),
  probe("getPreference", { key: "locale" }),
  proxied(
    "turns.cancel",
    { ...AGENT, conversationId: "no-such-conversation" },
    "POST conversations/:id/cancel is the engine's own route; the host relays it",
  ),
  probe("setPreference", { key: "locale", value: "en" }),
  probe("listAgents"),
  probe("preferences.setLocale", { ...WORKSPACE, locale: "en" }),
  probe("getHeartbeat"),
  probe("setHeartbeat", { patch: { time: "08:00" } }),
  probe("listInstalledConfigs"),
  probe("updateAgentColor", { agentId: PROBE_AGENT, color: "teal" }),
  probe("getAgentDelegation", AGENT),
  probe("setAgentDelegation", {
    ...AGENT,
    policy: { mode: "all", agents: [], acceptsMissions: true },
  }),
  proxied(
    "listAgentProviders",
    AGENT,
    "GET providers is the engine's own route; the host relays it",
  ),
  probe(
    "installAgentFromGithub",
    { githubUrl: "not-a-github-url" },
    {
      status: 503,
      reason:
        "a host seeded with nothing has no agent-config library to install from",
    },
  ),

  probe("listActivities", AGENT),
  probe("updateActivity", {
    ...AGENT,
    id: "no-such-activity",
    updates: {},
  }),
  probe("renameMission", {
    ...AGENT,
    id: "no-such-activity",
    title: "Parity probe",
  }),
  probe("setMissionMode", {
    ...AGENT,
    id: "no-such-activity",
    mode: "auto",
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
  probe("startFirstDay", { ...AGENT, input: {} }),

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
  probe("listSharedSkills", WORKSPACE),
  probe("loadSharedSkill", { ...WORKSPACE, slug: NO_SKILL }),
  probe("createSharedSkill", { ...WORKSPACE, body: {} }),
  probe("saveSharedSkill", { ...WORKSPACE, slug: NO_SKILL, content: "x" }),
  probe("promoteSharedSkill", { ...WORKSPACE, slug: NO_SKILL, content: "x" }),
  probe("deleteSharedSkill", { ...WORKSPACE, slug: NO_SKILL }),

  probe("readAgentFile", { ...AGENT, relPath: "config.json" }),
  probe("writeAgentFile", {
    ...AGENT,
    relPath: "parity-probe.json",
    content: "{}",
  }),

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

  ...LOCAL_INTEGRATION_PROBES,

  proxied(
    "conversations.list",
    AGENT,
    "GET conversations is the engine's own route; the host relays it",
  ),
  proxied(
    "conversations.rename",
    { ...AGENT, id: "no-such-conversation", title: "Parity probe" },
    "PATCH conversations/:id is the engine's own route; the host relays it",
  ),
  proxied(
    "conversations.delete",
    { ...AGENT, id: "no-such-conversation" },
    "DELETE conversations/:id is the engine's own route; the host relays it",
  ),
  proxied(
    "turns.history",
    { ...AGENT, conversationId: "no-such-conversation" },
    "GET conversations/:id/messages is the engine's own route; the host relays it",
  ),
];
