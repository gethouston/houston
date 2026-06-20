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
  FileEntry,
} from "./types";
import type {
  ProviderAuthState,
  ProviderStatus as EngineProviderStatus,
  GenerateInstructionsResult,
} from "@houston-ai/engine-client";
import { getEngine } from "./engine";
import { osPickDirectory } from "./os-bridge";
import { logger } from "./logger";
import { isMissingSkillError } from "./missing-skill";
import { normalizeLegacyModel } from "./providers";
import { shouldAutocompactForSession } from "./autocompact";
export { withAttachmentPaths } from "./attachment-message";

interface EngineCallOptions {
  /** Show a red error toast on failure. Default true. Set false when the
   *  caller renders the failure with its own inline UI. */
  toast?: boolean;
  /** Capture the failure to Sentry even when `toast` is false. Default true so
   *  user-initiated failures always reach crash reporting; set false only for
   *  genuinely fire-and-forget calls or ones with their own report path. */
  capture?: boolean;
  /** Classifier for errors that are expected + explainable (not Houston bugs).
   *  A matching error is logged but gets NO red bug toast and NO Sentry report;
   *  the caller surfaces it inline. Use sparingly, only for failures a user can
   *  understand and act on (e.g. a skill that was renamed or removed). The TS
   *  host emits bare-string errors with no typed `kind`, so silencing keys on a
   *  predicate over the thrown error rather than a kind string. */
  silence?: (err: unknown) => boolean;
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

  // Expected, explainable errors the caller surfaces inline. Logged above for
  // the local log tail, but no red bug toast and no Sentry report.
  if (options?.silence?.(err)) return;

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
  /** Agent configs installed on disk (bundled + user-authored), merged with the
   *  built-in templates by the agent loader to populate the create-agent gallery. */
  listInstalledConfigs: () =>
    call<Array<{ config: unknown; path: string }>>("list_installed_configs", () =>
      getEngine().listInstalledConfigs(),
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
      providerOverride?: string;
      modelOverride?: string;
      effortOverride?: string;
    },
  ) =>
    call<string>("send_message", async () => {
      // Centralized autocompact decision: when this session's context is
      // nearly full, ask the engine to summarize + reseed before this turn.
      // Computed here so every send path gets it; new conversations have no
      // usage yet and resolve to `false`.
      const compact = shouldAutocompactForSession(
        agentPath,
        sessionKey,
        opts?.providerOverride,
        opts?.modelOverride,
      );
      const res = await getEngine().startSession(agentPath, {
        sessionKey,
        prompt,
        source: "desktop",
        provider: opts?.providerOverride,
        model: opts?.modelOverride,
        effort: opts?.effortOverride,
        compact,
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
      // installed (the host answers 404). That's expected — the Skills view
      // surfaces it inline and refreshes the list — so don't fire the red bug
      // toast or report it.
      { silence: isMissingSkillError },
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
  /** Raw bytes over HTTP — powers in-browser preview + download (web build).
   *  Pass `{ toast: false }` when the caller renders the failure inline. */
  download: (agentPath: string, relativePath: string, options?: { toast?: boolean }) =>
    call<{ blob: Blob; contentType: string }>(
      "download_project_file",
      () => getEngine().downloadProjectFile(agentPath, relativePath),
      { agentPath, relativePath },
      options,
    ),
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
};

// ─── System (OS-native helpers, preserved for back-compat) ────────────

import { osOpenUrl } from "./os-bridge";
export const tauriSystem = {
  openUrl: (url: string) => osOpenUrl(url),
};

// ─── Agent file watcher ───────────────────────────────────────────────

export const tauriWatcher = {
  start: (agentPath: string) =>
    call<void>("start_agent_watcher", () => getEngine().startAgentWatcher(agentPath)),
  stop: () => call<void>("stop_agent_watcher", () => getEngine().stopAgentWatcher()),
};
