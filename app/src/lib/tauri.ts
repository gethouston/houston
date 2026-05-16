/**
 * Houston backend adapter.
 *
 * Every domain call (workspaces, agents, chat, skills, store, sync, …) flows
 * through `@houston-ai/engine-client` to the `houston-engine` subprocess the
 * Tauri supervisor spawned on startup (see `engine_supervisor.rs`).
 *
 * OS-native calls (`reveal_file`, `open_url`, `pick_directory`, terminal
 * launching, local CLI probes, frontend log writes) do NOT flow through the
 * engine — they live in `./os-bridge` because the engine may run on a remote
 * VPS where those APIs would be meaningless.
 */

import type {
  Workspace,
  Agent,
  SkillSummary,
  SkillDetail,
  CommunitySkillResult,
  RepoSkill,
  FileEntry,
  StoreListing,
  ImportedWorkspace,
} from "./types";
import type {
  ComposioAppEntry as EngineComposioAppEntry,
  ComposioStatus as EngineComposioStatus,
  ProviderAuthState,
  ProviderStatus as EngineProviderStatus,
  GenerateInstructionsResult,
} from "@houston-ai/engine-client";
import { getEngine } from "./engine";
import { osPickDirectory } from "./os-bridge";
import { logger } from "./logger";
export { withAttachmentPaths } from "./attachment-message";

interface EngineCallOptions {
  toast?: boolean;
}

/** Wrap an engine call and surface errors as toasts unless caller handles them inline. */
async function call<T>(
  label: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
  options?: EngineCallOptions,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await surfaceError(label, err, context, options);
    throw err;
  }
}

async function surfaceError(
  label: string,
  err: unknown,
  context?: Record<string, unknown>,
  options?: EngineCallOptions,
): Promise<void> {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  logger.error(`[engine:${label}] ${message}`, context ? JSON.stringify(context) : undefined);
  if (options?.toast === false) return;
  const { showErrorToast } = await import("./error-toast");
  showErrorToast(label, message);
}

// ─── Workspaces ────────────────────────────────────────────────────────

export const tauriWorkspaces = {
  list: () => call<Workspace[]>("list_workspaces", () => getEngine().listWorkspaces()),
  create: (name: string, provider?: string, model?: string) =>
    call<Workspace>("create_workspace", () =>
      getEngine().createWorkspace({ name, provider, model }),
    ),
  delete: (id: string) => call<void>("delete_workspace", () => getEngine().deleteWorkspace(id)),
  rename: (id: string, newName: string) =>
    call<void>("rename_workspace", async () => {
      await getEngine().renameWorkspace(id, { newName });
    }),
  updateProvider: (id: string, provider: string, model?: string) =>
    call<Workspace>("update_workspace_provider", () =>
      getEngine().setWorkspaceProvider(id, { provider, model }),
    ),
};

// ─── Agents ───────────────────────────────────────────────────────────

export interface CreateAgentResult {
  agent: Agent;
}

function toAgent(a: import("@houston-ai/engine-client").Agent): Agent {
  return {
    id: a.id,
    name: a.name,
    folderPath: a.folderPath,
    configId: a.configId,
    color: a.color,
    createdAt: a.createdAt,
    lastOpenedAt: a.lastOpenedAt,
  };
}

export const tauriAgents = {
  list: (workspaceId: string) =>
    call<Agent[]>("list_agents", async () =>
      (await getEngine().listAgents(workspaceId)).map(toAgent),
    ),
  pickDirectory: () => osPickDirectory(),
  create: (
    workspaceId: string,
    name: string,
    configId: string,
    color?: string,
    claudeMd?: string,
    installedPath?: string,
    seeds?: Record<string, string>,
    existingPath?: string,
  ) =>
    call<CreateAgentResult>("create_agent", async () => {
      const r = await getEngine().createAgent(workspaceId, {
        name,
        configId,
        color,
        claudeMd,
        installedPath,
        seeds,
        existingPath,
      });
      return {
        agent: toAgent(r.agent),
      };
    }),
  delete: (workspaceId: string, id: string) =>
    call<void>("delete_agent", () => getEngine().deleteAgent(workspaceId, id)),
  rename: (workspaceId: string, id: string, newName: string) =>
    call<void>("rename_agent", async () => {
      await getEngine().renameAgent(workspaceId, id, newName);
    }),
  updateColor: (workspaceId: string, id: string, color: string) =>
    call<Agent>("update_agent_color", async () =>
      toAgent(await getEngine().updateAgent(workspaceId, id, { color })),
    ),
  generateInstructions: (
    description: string,
    opts: { provider?: string; model?: string; signal?: AbortSignal } = {},
  ) =>
    call<GenerateInstructionsResult>(
      "generate_agent_instructions",
      () => getEngine().generateAgentInstructions(description, opts),
      undefined,
      { toast: false },
    ),
};

// ─── Chat sessions ────────────────────────────────────────────────────

export const tauriChat = {
  send: (
    agentPath: string,
    prompt: string,
    sessionKey: string,
    opts?: {
      mode?: string;
      promptFile?: string;
      workingDirOverride?: string;
      providerOverride?: string;
      modelOverride?: string;
      effortOverride?: string;
    },
  ) =>
    call<string>("send_message", async () => {
      const res = await getEngine().startSession(agentPath, {
        sessionKey,
        prompt,
        source: "desktop",
        workingDir: opts?.workingDirOverride,
        provider: opts?.providerOverride,
        model: opts?.modelOverride,
        effort: opts?.effortOverride,
      });
      return res.sessionKey;
    }),
  startOnboarding: (agentPath: string, sessionKey: string) =>
    call<void>("start_onboarding_session", async () => {
      await getEngine().startOnboarding(agentPath, sessionKey);
    }),
  stop: (agentPath: string, sessionKey: string) =>
    call<void>("stop_session", async () => {
      await getEngine().cancelSession(agentPath, sessionKey);
    }),
  loadHistory: (agentPath: string, sessionKey: string) =>
    call<Array<{ feed_type: string; data: unknown }>>("load_chat_history", () =>
      getEngine().loadChatHistory(agentPath, sessionKey),
    ),
  summarize: (message: string) =>
    call<{ title: string; description: string }>("summarize_activity", () =>
      getEngine().summarizeActivity(message),
    ),
};

// ─── Composer attachments ─────────────────────────────────────────────

export const tauriAttachments = {
  save: async (scopeId: string, files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];
    return call<string[]>("save_attachments", () =>
      getEngine().saveAttachments(scopeId, files),
    );
  },
  delete: (scopeId: string) =>
    call<void>("delete_attachments", () => getEngine().deleteAttachments(scopeId)),
};

// ─── Agent-data files (`.houston/**`) ─────────────────────────────────

export const tauriAgent = {
  readFile: (agentPath: string, relPath: string) =>
    call<string>("read_agent_file", () => getEngine().readAgentFile(agentPath, relPath)),
  writeFile: (agentPath: string, relPath: string, content: string) =>
    call<void>("write_agent_file", () =>
      getEngine().writeAgentFile(agentPath, relPath, content),
    ),
  seedSchemas: (agentPath: string) =>
    call<void>("seed_agent_schemas", () => getEngine().seedAgentSchemas(agentPath)),
  migrateFiles: (agentPath: string) =>
    call<void>("migrate_agent_files", () => getEngine().migrateAgentFiles(agentPath)),
};

// ─── Skills ───────────────────────────────────────────────────────────

export const tauriSkills = {
  list: (agentPath: string) =>
    call<SkillSummary[]>("list_skills", async () =>
      (await getEngine().listSkills(agentPath)).map((s) => ({
        name: s.name,
        description: s.description,
        version: s.version,
        tags: s.tags,
        created: s.created,
        last_used: s.lastUsed,
        category: s.category ?? null,
        featured: s.featured ?? false,
        integrations: s.integrations ?? [],
        image: s.image ?? null,
        inputs: (s.inputs ?? []).map((i) => ({
          name: i.name,
          label: i.label,
          placeholder: i.placeholder,
          type: i.type,
          required: i.required,
          default: i.default,
          options: i.options ?? [],
        })),
        prompt_template: s.promptTemplate ?? null,
      })),
    ),
  load: (agentPath: string, name: string) =>
    call<SkillDetail>("load_skill", () => getEngine().loadSkill(agentPath, name)),
  create: (agentPath: string, name: string, description: string, content: string) =>
    call<void>("create_skill", () =>
      getEngine().createSkill({ workspacePath: agentPath, name, description, content }),
    ),
  delete: (agentPath: string, name: string) =>
    call<void>("delete_skill", () => getEngine().deleteSkill(agentPath, name)),
  save: (agentPath: string, name: string, content: string) =>
    call<void>("save_skill", () =>
      getEngine().saveSkill(name, { workspacePath: agentPath, content }),
    ),
  listFromRepo: (source: string) =>
    call<RepoSkill[]>("list_skills_from_repo", () => getEngine().listSkillsFromRepo(source)),
  installFromRepo: (agentPath: string, source: string, skills: RepoSkill[]) =>
    call<string[]>("install_skills_from_repo", () =>
      getEngine().installSkillsFromRepo({
        workspacePath: agentPath,
        source,
        skills,
      }),
    ),
  searchCommunity: (query: string, signal?: AbortSignal) =>
    call<CommunitySkillResult[]>(
      "search_community_skills",
      async () =>
        (await getEngine().searchCommunitySkills(query, signal)).map((s) => ({
          id: s.id,
          skillId: s.skillId,
          name: s.name,
          installs: s.installs,
          source: s.source,
        })),
      undefined,
      { toast: false },
    ),
  popularCommunity: (signal?: AbortSignal) =>
    call<CommunitySkillResult[]>(
      "popular_community_skills",
      async () =>
        (await getEngine().popularCommunitySkills(signal)).map((s) => ({
          id: s.id,
          skillId: s.skillId,
          name: s.name,
          installs: s.installs,
          source: s.source,
        })),
      undefined,
      { toast: false },
    ),
  installCommunity: (
    agentPath: string,
    source: string,
    skillId: string,
    signal?: AbortSignal,
  ) =>
    call<string>(
      "install_community_skill",
      () =>
        getEngine().installCommunitySkill(
          {
            workspacePath: agentPath,
            source,
            skillId,
          },
          signal,
        ),
      undefined,
      { toast: false },
    ),
};

// ─── Composio ─────────────────────────────────────────────────────────

export interface ComposioAppEntry {
  toolkit: string;
  name: string;
  description: string;
  logo_url: string;
  categories: string[];
}

export type ComposioStatus = EngineComposioStatus;

export interface StartLoginResponse {
  login_url: string;
  cli_key: string;
}

export interface StartLinkResponse {
  redirect_url: string;
  connected_account_id: string;
  toolkit: string;
}

export const tauriConnections = {
  list: () =>
    call<ComposioStatus>("list_composio_connections", () => getEngine().composioStatus()),
  listApps: () =>
    call<ComposioAppEntry[]>("list_composio_apps", async () =>
      (await getEngine().composioListApps()).map((a: EngineComposioAppEntry) => ({
        toolkit: a.toolkit,
        name: a.name,
        description: a.description,
        logo_url: a.logo_url,
        categories: a.categories,
      })),
    ),
  listConnectedToolkits: () =>
    call<string[]>("list_composio_connected_toolkits", () =>
      getEngine().composioListConnections(),
    ),
  connectApp: (toolkit: string) =>
    call<StartLinkResponse>("connect_composio_app", async () => {
      const r = await getEngine().composioConnectApp(toolkit);
      return {
        redirect_url: r.redirect_url,
        connected_account_id: r.connected_account_id,
        toolkit: r.toolkit,
      };
    }),
  watchConnection: (toolkit: string) =>
    call<void>(
      "watch_composio_connection",
      () => getEngine().composioWatchConnection(toolkit),
      { toolkit },
      // Fire-and-forget — caller awaits only to know the request was
      // accepted; the result is delivered as a `ComposioConnectionAdded`
      // WS event. Don't toast; failure here just means we fall back to
      // the client-side watcher.
      { toast: false },
    ),
  startOAuth: () =>
    call<StartLoginResponse>("start_composio_oauth", async () => {
      const r = await getEngine().composioStartLogin();
      return { login_url: r.login_url, cli_key: r.cli_key };
    }),
  completeLogin: (cliKey: string) =>
    call<void>("complete_composio_login", () => getEngine().composioCompleteLogin(cliKey)),
  isCliInstalled: () =>
    call<boolean>("is_composio_cli_installed", () => getEngine().composioCliInstalled()),
  installCli: () => call<void>("install_composio_cli", () => getEngine().composioInstallCli()),
};

// ─── Project files (browser) ──────────────────────────────────────────

import { osOpenFile, osRevealAgent, osRevealFile } from "./os-bridge";

export const tauriFiles = {
  list: (agentPath: string) =>
    call<FileEntry[]>("list_project_files", async () =>
      (await getEngine().listProjectFiles(agentPath)).map((f) => ({
        path: f.path,
        name: f.name,
        extension: f.extension,
        size: f.size,
      })),
    ),
  open: (agentPath: string, relativePath: string) =>
    osOpenFile(agentPath, relativePath),
  reveal: (agentPath: string, relativePath: string) =>
    osRevealFile(agentPath, relativePath),
  delete: (agentPath: string, relativePath: string) =>
    call<void>("delete_file", () => getEngine().deleteFile(agentPath, relativePath)),
  rename: (agentPath: string, relativePath: string, newName: string) =>
    call<void>("rename_file", () =>
      getEngine().renameFile(agentPath, relativePath, newName),
    ),
  createFolder: (agentPath: string, name: string) =>
    call<void>("create_agent_folder", async () => {
      await getEngine().createFolder(agentPath, name);
    }),
  revealAgent: (agentPath: string) => osRevealAgent(agentPath),
};

// ─── Store ────────────────────────────────────────────────────────────

export const tauriStore = {
  listInstalled: () =>
    call<Array<{ config: unknown; path: string }>>("list_installed_configs", () =>
      getEngine().listInstalledConfigs(),
    ),
  fetchCatalog: () =>
    call<StoreListing[]>("fetch_store_catalog", () => getEngine().storeCatalog()),
  search: (query: string) =>
    call<StoreListing[]>("search_store", () => getEngine().storeSearch(query)),
  install: (repo: string, agentId: string) =>
    call<void>("install_store_agent", () =>
      getEngine().installStoreAgent({ repo, agentId }),
    ),
  uninstall: (agentId: string) =>
    call<void>("uninstall_store_agent", () => getEngine().uninstallStoreAgent(agentId)),
  installFromGithub: (githubUrl: string) =>
    call<string>(
      "install_agent_from_github",
      async () => (await getEngine().installAgentFromGithub({ githubUrl })).agentId,
    ),
  checkUpdates: () =>
    call<string[]>("check_agent_updates", () => getEngine().checkAgentUpdates()),
  installWorkspaceFromGithub: (githubUrl: string) =>
    call<ImportedWorkspace>("install_workspace_from_github", () =>
      getEngine().installWorkspaceFromGithub({ githubUrl }),
    ),
};

// ─── Conversations ────────────────────────────────────────────────────

interface RawConversation {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: "primary" | "activity";
  session_key: string;
  updated_at?: string;
  agent_path: string;
  agent_name: string;
}

export const tauriConversations = {
  list: (agentPath: string) =>
    call<RawConversation[]>("list_conversations", async () =>
      (await getEngine().listConversations(agentPath)).map(conversationToRaw),
    ),
  listAll: (agentPaths: string[]) =>
    call<RawConversation[]>("list_all_conversations", async () =>
      (await getEngine().listAllConversations(agentPaths)).map(conversationToRaw),
    ),
};

function conversationToRaw(
  c: import("@houston-ai/engine-client").ConversationEntry,
): RawConversation {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: c.status,
    type: c.type as "primary" | "activity",
    session_key: c.session_key,
    updated_at: c.updated_at,
    agent_path: c.agent_path,
    agent_name: c.agent_name,
  };
}

// ─── Routines (engine-backed: CRUD + scheduler) ───────────────────────

import * as activityData from "../data/activity";
import * as configData from "../data/config";
import type {
  NewRoutine as EngineNewRoutine,
  RoutineUpdate as EngineRoutineUpdate,
} from "@houston-ai/engine-client";

export const tauriRoutines = {
  list: (agentPath: string) =>
    call("list_routines", () => getEngine().listRoutines(agentPath)),
  create: (agentPath: string, input: EngineNewRoutine) =>
    call("create_routine", () => getEngine().createRoutine(agentPath, input)),
  update: (
    agentPath: string,
    routineId: string,
    updates: EngineRoutineUpdate,
  ) =>
    call("update_routine", () =>
      getEngine().updateRoutine(agentPath, routineId, updates),
    ),
  delete: (agentPath: string, routineId: string) =>
    call<void>("delete_routine", () =>
      getEngine().deleteRoutine(agentPath, routineId),
    ),
  listRuns: (agentPath: string, routineId?: string) =>
    call("list_routine_runs", () =>
      getEngine().listRoutineRuns(agentPath, routineId),
    ),
  runNow: (agentPath: string, routineId: string) =>
    call<void>("run_routine_now", () =>
      getEngine().runRoutineNow(agentPath, routineId),
    ),
  startScheduler: (agentPath: string) =>
    call<void>("start_routine_scheduler", () =>
      getEngine().startRoutineScheduler(agentPath),
    ),
  stopScheduler: (agentPath: string) =>
    call<void>("stop_routine_scheduler", () =>
      getEngine().stopRoutineScheduler(agentPath),
    ),
  syncScheduler: (agentPath: string) =>
    call<void>("sync_routine_scheduler", () =>
      getEngine().syncRoutineScheduler(agentPath),
    ),
};

export const tauriActivity = {
  list: (agentPath: string) => activityData.list(agentPath),
  create: (
    agentPath: string,
    title: string,
    description?: string,
    agent?: string,
    worktreePath?: string,
    provider?: string,
    model?: string,
  ) => activityData.create(agentPath, title, description ?? "", agent, worktreePath, provider, model),
  update: (
    agentPath: string,
    activityId: string,
    update: activityData.ActivityUpdate,
  ) => activityData.update(agentPath, activityId, update).then(() => undefined),
  delete: (agentPath: string, activityId: string) =>
    activityData.remove(agentPath, activityId),
};

// ─── Worktrees & shell ────────────────────────────────────────────────

export const tauriWorktree = {
  create: (repoPath: string, name: string, branch?: string) =>
    call<{ path: string; branch: string; is_main: boolean }>(
      "create_worktree",
      async () => {
        const w = await getEngine().createWorktree({ repoPath, name, branch });
        return { path: w.path, branch: w.branch, is_main: w.isMain };
      },
    ),
  remove: (repoPath: string, worktreePath: string) =>
    call<void>("remove_worktree", () =>
      getEngine().removeWorktree({ repoPath, worktreePath }),
    ),
  list: (repoPath: string) =>
    call<Array<{ path: string; branch: string; is_main: boolean }>>(
      "list_worktrees",
      async () =>
        (await getEngine().listWorktrees({ repoPath })).map((w) => ({
          path: w.path,
          branch: w.branch,
          is_main: w.isMain,
        })),
    ),
};

export const tauriShell = {
  run: (path: string, command: string) =>
    call<string>("run_shell", () => getEngine().runShell({ path, command })),
};

// Terminal launching is OS-native — see `./os-bridge::osOpenTerminal`.
// Keep the `tauriTerminal` export for callers that haven't migrated.
import { osOpenTerminal } from "./os-bridge";
export const tauriTerminal = {
  open: (path: string, command?: string, terminalApp?: string) =>
    osOpenTerminal(path, command, terminalApp),
};

// ─── Agent config (per-agent JSON on disk) ────────────────────────────

export const tauriConfig = {
  read: (agentPath: string) => configData.read(agentPath),
  write: (agentPath: string, config: configData.Config) =>
    configData.write(agentPath, config),
};

// ─── Preferences ──────────────────────────────────────────────────────

export const tauriPreferences = {
  get: (key: string) =>
    call<string | null>("get_preference", () => getEngine().getPreference(key)),
  set: (key: string, value: string) =>
    call<void>("set_preference", () => getEngine().setPreference(key, value)),
};

// ─── Providers ────────────────────────────────────────────────────────

export interface ProviderStatus {
  provider: string;
  cli_installed: boolean;
  auth_state: ProviderAuthState;
  authenticated: boolean;
  cli_name: string;
}

const DEFAULT_PROVIDER_PREF_KEY = "default_provider";

export const tauriProvider = {
  checkStatus: (provider: string) =>
    call<ProviderStatus>("check_provider_status", async () => {
      const p: EngineProviderStatus = await getEngine().providerStatus(provider);
      return {
        provider: p.provider,
        cli_installed: p.cliInstalled,
        auth_state: p.authState,
        authenticated: p.authState === "authenticated",
        cli_name: p.cliName,
      };
    }),
  getDefault: () =>
    call<string>(
      "get_default_provider",
      async () => (await getEngine().getPreference(DEFAULT_PROVIDER_PREF_KEY)) ?? "",
    ),
  setDefault: (provider: string) =>
    call<void>("set_default_provider", () =>
      getEngine().setPreference(DEFAULT_PROVIDER_PREF_KEY, provider),
    ),
  launchLogin: (provider: string) =>
    call<void>("launch_provider_login", () => getEngine().providerLogin(provider)),
  launchLogout: (provider: string) =>
    call<void>("launch_provider_logout", () => getEngine().providerLogout(provider)),
};

// ─── System (OS-native helpers, preserved for back-compat) ────────────

import { osCheckClaudeCli, osOpenUrl } from "./os-bridge";
export const tauriSystem = {
  checkClaudeCli: () => osCheckClaudeCli(),
  openUrl: (url: string) => osOpenUrl(url),
};

// ─── Agent file watcher ───────────────────────────────────────────────

export const tauriWatcher = {
  start: (agentPath: string) =>
    call<void>("start_agent_watcher", () => getEngine().startAgentWatcher(agentPath)),
  stop: () => call<void>("stop_agent_watcher", () => getEngine().stopAgentWatcher()),
};

// ─── Tunnel (mobile pairing) ──────────────────────────────────────────

import type {
  TunnelStatus as EngineTunnelStatus,
  PairingCode as EnginePairingCode,
} from "@houston-ai/engine-client";

export const tauriTunnel = {
  status: () =>
    call<EngineTunnelStatus>("tunnel_status", () => getEngine().tunnelStatus()),
  mintPairingCode: () =>
    call<EnginePairingCode>("tunnel_mint_pairing", () => getEngine().mintPairingCode()),
  resetAccess: () =>
    call<EnginePairingCode>("tunnel_reset_access", () => getEngine().resetPhoneAccess()),
};
