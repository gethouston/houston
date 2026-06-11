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
import { MISSING_SKILL_KIND } from "./missing-skill";
import { normalizeLegacyModel } from "./providers";
import { shouldAutocompactForSession } from "./autocompact";
import { useProviderSwitchStore } from "../stores/provider-switch";
export { withAttachmentPaths } from "./attachment-message";

interface EngineCallOptions {
  /** Show a red error toast on failure. Default true. Set false when the
   *  caller renders the failure with its own inline UI. */
  toast?: boolean;
  /** Capture the failure to Sentry even when `toast` is false. Default true so
   *  user-initiated failures always reach crash reporting; set false only for
   *  genuinely fire-and-forget calls or ones with their own report path. */
  capture?: boolean;
  /** Engine error `kind`s that are expected + explainable (not Houston bugs).
   *  Matching errors are logged but get NO red bug toast and NO Sentry report;
   *  the caller surfaces them inline. Use sparingly, only for kinds a user can
   *  understand and act on (e.g. `skill_not_found` — the skill was renamed or
   *  removed). */
  silenceKinds?: string[];
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

  // Aborted requests (user typed again, navigated away, cancelled a sign-in)
  // are expected, not failures — never toast or report them.
  if (err instanceof Error && err.name === "AbortError") return;

  // Expected, explainable engine errors the caller surfaces inline. Logged
  // above for the local log tail, but no red bug toast and no Sentry report.
  const kind =
    err && typeof err === "object" && "kind" in err
      ? (err as { kind?: unknown }).kind
      : undefined;
  if (typeof kind === "string" && options?.silenceKinds?.includes(kind)) return;

  const shouldToast = options?.toast !== false;
  const shouldCapture = options?.capture !== false;
  if (!shouldToast && !shouldCapture) return;

  const { showErrorToast, reportError } = await import("./error-toast");
  if (shouldToast) {
    // Pass the real error so Sentry records the true failure stack (the
    // engine-client frame), not a synthetic one — this also fixes Sentry
    // grouping (engine errors used to collapse into a single issue).
    showErrorToast(label, message, err);
  } else {
    // toast suppressed but capture wanted: report to Sentry without a toast.
    reportError(label, message, err);
  }
}

// ─── Workspaces ────────────────────────────────────────────────────────

export const tauriWorkspaces = {
  list: () => call<Workspace[]>("list_workspaces", () => getEngine().listWorkspaces()),
  create: (name: string) =>
    call<Workspace>("create_workspace", () => getEngine().createWorkspace({ name })),
  delete: (id: string) => call<void>("delete_workspace", () => getEngine().deleteWorkspace(id)),
  rename: (id: string, newName: string) =>
    call<void>("rename_workspace", async () => {
      await getEngine().renameWorkspace(id, { newName });
    }),
  setLocale: (id: string, locale: string | null) =>
    call<Workspace>("set_workspace_locale", () =>
      getEngine().setWorkspaceLocale(id, locale),
    ),
  getContext: (id: string) =>
    call<import("@houston-ai/engine-client").WorkspaceContext>(
      "get_workspace_context",
      () => getEngine().getWorkspaceContext(id),
    ),
  setContext: (
    id: string,
    body: import("@houston-ai/engine-client").WorkspaceContext,
  ) =>
    call<import("@houston-ai/engine-client").WorkspaceContext>(
      "set_workspace_context",
      () => getEngine().setWorkspaceContext(id, body),
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
    call<Agent>("rename_agent", async () =>
      toAgent(await getEngine().renameAgent(workspaceId, id, newName)),
    ),
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
      // A staged provider switch (the user changed providers mid-conversation)
      // takes precedence over autocompact: the engine reseeds a fresh session
      // on the new provider, so same-provider context-full compaction doesn't
      // apply. PEEK, don't clear — the handoff is cleared only when the engine
      // confirms the switch with a `provider_switched` event, so a failed seed
      // is retried on the next send instead of silently continuing blank.
      const handoff = useProviderSwitchStore
        .getState()
        .peekPending(agentPath, sessionKey);
      // Centralized autocompact decision: when this session's context is
      // nearly full, ask the engine to summarize + reseed before this turn.
      // Computed here so every send path gets it; new conversations have no
      // usage yet and resolve to `false`.
      const compact = handoff
        ? false
        : shouldAutocompactForSession(
            agentPath,
            sessionKey,
            opts?.providerOverride,
            opts?.modelOverride,
          );
      const res = await getEngine().startSession(agentPath, {
        sessionKey,
        prompt,
        source: "desktop",
        workingDir: opts?.workingDirOverride,
        provider: opts?.providerOverride,
        model: opts?.modelOverride,
        effort: opts?.effortOverride,
        compact,
        providerSwitch: handoff
          ? { mode: handoff.mode, fromProvider: handoff.fromProvider }
          : undefined,
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
    call<SkillDetail>(
      "load_skill",
      () => getEngine().loadSkill(agentPath, name),
      undefined,
      // The skill the user opened may have been renamed, deleted, or never
      // installed. That's expected — the Skills view surfaces it inline and
      // refreshes the list — so don't fire the red bug toast or report it.
      { silenceKinds: [MISSING_SKILL_KIND] },
    ),
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

export interface ReconnectResult {
  /** URL to open for OAuth re-consent, or null when refreshed silently. */
  redirectUrl: string | null;
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
  disconnectApp: (toolkit: string) =>
    call<void>(
      "disconnect_composio_app",
      () => getEngine().composioDisconnect(toolkit),
      { toolkit },
    ),
  reconnectApp: (toolkit: string) =>
    call<ReconnectResult>(
      "reconnect_composio_app",
      async () => {
        const r = await getEngine().composioReconnect(toolkit);
        return { redirectUrl: r.redirectUrl };
      },
      { toolkit },
    ),
  watchConnection: (toolkit: string) =>
    call<void>(
      "watch_composio_connection",
      () => getEngine().composioWatchConnection(toolkit),
      { toolkit },
      // Fire-and-forget — caller awaits only to know the request was
      // accepted; the result is delivered as a `ComposioConnectionAdded`
      // WS event. Don't toast OR report; failure here just means we fall
      // back to the client-side watcher.
      { toast: false, capture: false },
    ),
  startOAuth: () =>
    call<StartLoginResponse>("start_composio_oauth", async () => {
      const r = await getEngine().composioStartLogin();
      return { login_url: r.login_url, cli_key: r.cli_key };
    }),
  completeLogin: (cliKey: string) =>
    call<void>("complete_composio_login", () => getEngine().composioCompleteLogin(cliKey)),
  logout: () => call<void>("logout_composio", () => getEngine().composioLogout()),
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
        is_directory: f.is_directory,
        dateModified: f.date_modified,
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
  agent?: string;
  routine_id?: string;
  worktree_path?: string | null;
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
    agent: c.agent,
    routine_id: c.routine_id,
    worktree_path: c.worktree_path,
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
  cancelRun: (agentPath: string, routineId: string, runId: string) =>
    call("cancel_routine_run", () =>
      getEngine().cancelRoutineRun(agentPath, routineId, runId),
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
  bulkUpdate: (
    agentPath: string,
    ids: string[],
    update: activityData.ActivityUpdate,
  ) => activityData.bulkUpdate(agentPath, ids, update),
  bulkDelete: (agentPath: string, ids: string[]) =>
    activityData.bulkRemove(agentPath, ids),
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
const DEFAULT_MODEL_PREF_KEY = "default_model";

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
  /**
   * Last (provider, model) pair the user picked anywhere — agent creation
   * dialog, AI-assist step, or chat-tab model picker. Used as the default
   * for the next new agent. Returns `(null, null)` on a fresh install.
   *
   * Provider is stored under the existing `default_provider` key so an
   * already-onboarded install carries its old preference forward without a
   * migration step. The companion model key is new (no upgrade path needed
   * because a missing value just falls back to the provider's
   * `defaultModel`).
   *
   * The stored model is normalized through `normalizeLegacyModel` on the way
   * out: an install that last picked a model before the catalog pinned
   * versions has a bare `"opus"`/`"sonnet"` in this preference, and creation
   * dialogs seed a new agent's config from this value. Normalizing here means
   * they never write a retired alias into a fresh config.
   */
  getLastUsed: () =>
    call<{ provider: string | null; model: string | null }>(
      "get_last_used_provider",
      async () => {
        const eng = getEngine();
        const [provider, model] = await Promise.all([
          eng.getPreference(DEFAULT_PROVIDER_PREF_KEY),
          eng.getPreference(DEFAULT_MODEL_PREF_KEY),
        ]);
        return { provider: provider ?? null, model: normalizeLegacyModel(model) };
      },
    ),
  setLastUsed: (provider: string, model: string) =>
    call<void>("set_last_used_provider", async () => {
      const eng = getEngine();
      await eng.setPreference(DEFAULT_PROVIDER_PREF_KEY, provider);
      await eng.setPreference(DEFAULT_MODEL_PREF_KEY, model);
    }),
  launchLogin: (provider: string, opts?: { deviceAuth?: boolean }) =>
    call<void>("launch_provider_login", () => getEngine().providerLogin(provider, opts)),
  launchLogout: (provider: string) =>
    call<void>("launch_provider_logout", () => getEngine().providerLogout(provider)),
  /**
   * Submit the OAuth verification code the user pasted from their
   * browser. Only meaningful for remote/headless engines (container,
   * Always-On VPS) where the CLI can't open the user's browser
   * directly — the engine surfaces the sign-in URL via the
   * `ProviderLoginUrl` WS event, the UI shows the dialog, and this
   * call relays the code back to the CLI's stdin.
   */
  submitLoginCode: (provider: string, code: string) =>
    call<void>("submit_provider_login_code", () =>
      getEngine().submitProviderLoginCode(provider, code),
    ),
  /**
   * Abort an in-flight sign-in the user gave up on (closed the OAuth
   * tab, stuck spinner). Kills the CLI subprocess on the engine and
   * frees the slot so the next `launchLogin` isn't rejected as
   * "already pending" — the user can retry immediately instead of
   * restarting Houston (#237). Idempotent and benign: the engine emits
   * a `ProviderLoginComplete` with `success: false` and no `error`, so
   * pending spinners clear without an error toast.
   */
  cancelLogin: (provider: string) =>
    call<void>("cancel_provider_login", () => getEngine().cancelProviderLogin(provider)),
  /**
   * Save a Gemini API key to `~/.gemini/.env` via the engine. Errors
   * surface through `call`'s standard rejection path; the caller is
   * expected to render them with `errorMessage(err)` + `addToast`.
   *
   * Gemini-only by design (other providers use OAuth via launchLogin).
   * Never log `apiKey` — it's a SECRET.
   */
  setGeminiApiKey: (apiKey: string) =>
    call<void>("set_gemini_api_key", () => getEngine().setGeminiApiKey(apiKey)),
};

// ─── System (OS-native helpers, preserved for back-compat) ────────────

import { osCheckClaudeCli, osOpenUrl } from "./os-bridge";
export const tauriSystem = {
  checkClaudeCli: () => osCheckClaudeCli(),
  openUrl: (url: string) => osOpenUrl(url),
};

// ─── Claude Code runtime installer ────────────────────────────────────

import type { ClaudeStatus as EngineClaudeStatus } from "@houston-ai/engine-client";

/** Mirror of the engine `ClaudeStatus` — re-exported so callers can
 *  import from `lib/tauri.ts` like the other engine DTOs. */
export type ClaudeStatus = EngineClaudeStatus;

/** Runtime install bridge for the proprietary Claude Code CLI.
 *
 *  Distinct from `tauriProvider`: provider-level concerns (auth, CLI
 *  spawn) sit on `tauriProvider`; the *install* of Anthropic's CLI is
 *  Houston-managed (we download it because the license forbids
 *  bundling) and exposed here so the onboarding card can show a
 *  specific "couldn't reach Anthropic — Retry" affordance — issue #231.
 */
export const tauriClaude = {
  status: () =>
    call<ClaudeStatus>("claude_status", () => getEngine().claudeStatus()),
  /**
   * Triggers the background install. Errors are deliberately not
   * auto-toasted by `call` — both callers (the onboarding card hook and
   * the `ClaudeCliFailed` toast retry action) surface failures
   * themselves, and double-toasting on a retry click is noisy.
   */
  install: () =>
    call<void>(
      "claude_install",
      () => getEngine().claudeInstall(),
      undefined,
      // Both callers (onboarding card + ClaudeCliFailed retry) surface and
      // report failures themselves; capture here would double-report.
      { toast: false, capture: false },
    ),
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
