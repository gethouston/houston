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
  AgentAssignment,
  CustomEndpoint,
  ComposioAppEntry as EngineComposioAppEntry,
  ComposioStatus as EngineComposioStatus,
  ProviderStatus as EngineProviderStatus,
  GenerateInstructionsResult,
  ProviderAuthState,
} from "@houston-ai/engine-client";
import { shouldUseClaudeDesktopLogin } from "../components/shell/provider-login-url";
import {
  blockWriteWhileWarming,
  blockWriteWhileWarmingById,
  isAgentPathWarming,
  type WarmingWriteOptions,
} from "./agent-warming-guard";
import {
  beginClaudeBrowserLogin,
  cancelClaudeBrowserLogin,
} from "./claude-login";
import { COMPOSIO_ALREADY_CONNECTED_KIND } from "./composio-already-connected";
import { getEngine, isRemoteEngine } from "./engine";
import { engineCallSurface } from "./engine-call-policy";
import {
  codexUsesLoopbackRelay,
  isLoopbackHostUrl,
  providerLoginUsesDeviceAuthByDefault,
} from "./engine-mode";
import { logger } from "./logger";
import { isMissingSkillError } from "./missing-skill";
import { osIsTauri, osPickDirectory } from "./os-bridge";
import { normalizeLegacyModel } from "./providers";
import type {
  Agent,
  CommunitySkillResult,
  FileEntry,
  RepoSkill,
  SkillDetail,
  SkillSummary,
  Workspace,
} from "./types";

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
   *  understand and act on (e.g. the legacy Rust engine's typed
   *  `composio_login_timeout` / `composio_already_connected`). */
  silenceKinds?: string[];
  /** Classifier for errors that are expected + explainable (not Houston bugs).
   *  A matching error is logged but gets NO red bug toast and NO Sentry report;
   *  the caller surfaces it inline. Use sparingly, only for failures a user can
   *  understand and act on (e.g. a skill that was renamed or removed). The TS
   *  host emits bare-string / status-only errors with no typed `kind`, so this
   *  predicate keys on the thrown error rather than a kind string. */
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
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  logger.error(
    `[engine:${label}] ${message}`,
    context ? JSON.stringify(context) : undefined,
  );

  // Expected, explainable engine errors the caller surfaces inline. Logged
  // above for the local log tail, but no red bug toast and no Sentry report.
  //
  // Two complementary matchers so both engine wire formats are covered:
  //  - `silenceKinds` — the legacy Rust engine tags errors with a typed
  //    `kind` (e.g. `composio_login_timeout`, `composio_already_connected`).
  //  - `silence` — the TS host emits bare-string / status-only errors with no
  //    typed `kind`, so callers pass a predicate over the whole error (e.g.
  //    `isMissingSkillError`, which reads the HoustonEngineError `.status`).
  const kind =
    err && typeof err === "object" && "kind" in err
      ? (err as { kind?: unknown }).kind
      : undefined;
  if (typeof kind === "string" && options?.silenceKinds?.includes(kind)) return;
  if (options?.silence?.(err)) return;

  // Aborted requests are expected; `toast: false` callers render their own
  // failure UI but the error is still captured. See `engineCallSurface`.
  const { toast: shouldToast, capture: shouldCapture } = engineCallSurface(
    err instanceof Error ? err.name : undefined,
    options,
  );
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
  list: () =>
    call<Workspace[]>("list_workspaces", () => getEngine().listWorkspaces()),
  create: (name: string) =>
    call<Workspace>("create_workspace", () =>
      getEngine().createWorkspace({ name }),
    ),
  delete: (id: string) =>
    call<void>("delete_workspace", () => getEngine().deleteWorkspace(id)),
  rename: (id: string, newName: string) =>
    call<void>("rename_workspace", async () => {
      await getEngine().renameWorkspace(id, { newName });
    }),
  setLocale: (id: string, locale: string | null) =>
    call<Workspace>("set_workspace_locale", () =>
      getEngine().setWorkspaceLocale(id, locale),
    ),
};

// ─── Agents ───────────────────────────────────────────────────────────

export interface CreateAgentResult {
  agent: Agent;
}

/** Engine wire agent → app Agent. Exported for flows that receive an agent
 *  record outside the tauriAgents wrappers (the import wizard, HOU-710). */
export function toAgent(a: import("@houston-ai/engine-client").Agent): Agent {
  return {
    id: a.id,
    name: a.name,
    folderPath: a.folderPath,
    localDir: a.localDir,
    configId: a.configId,
    color: a.color,
    createdAt: a.createdAt,
    lastOpenedAt: a.lastOpenedAt,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
    access: a.access,
    assignments: a.assignments,
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
  rename: (workspaceId: string, id: string, newName: string) => {
    // A rename dispatches into the agent's engine — held while it warms up.
    blockWriteWhileWarmingById(id);
    return call<Agent>("rename_agent", async () =>
      toAgent(await getEngine().renameAgent(workspaceId, id, newName)),
    );
  },
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
    call<Array<{ config: unknown; path: string }>>(
      "list_installed_configs",
      () => getEngine().listInstalledConfigs(),
    ),
  /** Multiplayer: set which org members may use this agent, and at what access
   *  level. Pass the v2 `AgentAssignment[]` (`{userId, access}`) roster from the
   *  Share dialog; the legacy `string[]` (userIds → access `user`) shape still
   *  works for older callers. Empty = everyone. */
  setAssignments: (
    agentSlugOrId: string,
    assignments: AgentAssignment[] | string[],
  ) =>
    call<void>("set_agent_assignments", () =>
      getEngine().setAgentAssignments(agentSlugOrId, assignments),
    ),
};

/**
 * Teams v2: an agent's allowed-toolkit ceiling. `get` reads the agent + org
 * ceilings plus the caller's effective access; `set` (agent-manager only)
 * replaces the agent ceiling (`null` = all allowed, `[]` = none), and the host
 * prunes now-disallowed toolkits from existing grants. Both route through
 * `call()` so failures surface as toasts with a Report-bug affordance.
 */
export const tauriAgentSettings = {
  get: (agentSlugOrId: string) =>
    call("get_agent_settings", () =>
      getEngine().getAgentSettings(agentSlugOrId),
    ),
  set: (
    agentSlugOrId: string,
    settings: {
      allowedToolkits?: string[] | null;
      allowedModels?: string[] | null;
    },
  ) =>
    call<void>("set_agent_settings", () =>
      getEngine().setAgentSettings(agentSlugOrId, settings),
    ),
};

/**
 * Teams v2: the ACTING user's per-agent model choice + the agent's effective
 * `allowedModels` ceiling. `get` degrades to `null` on a non-Teams host (the
 * engine-client swallows the 404); `set` 400s `model_not_allowed` outside the
 * ceiling. Both route through `call()` so failures surface as a toast + Report
 * bug, same as the wrappers above.
 */
export const tauriAgentModelChoice = {
  get: (agentSlugOrId: string) =>
    call("get_agent_model_choice", () =>
      getEngine().getAgentModelChoice(agentSlugOrId),
    ),
  set: (
    agentSlugOrId: string,
    choice: import("@houston-ai/engine-client").AgentModelChoice,
  ) =>
    call<void>("set_agent_model_choice", () =>
      getEngine().setAgentModelChoice(agentSlugOrId, choice),
    ),
};

// ─── Chat sessions ────────────────────────────────────────────────────

/**
 * How a chat history load behaves. `observe: false` marks a BULK read
 * (mission search, board scans over N conversations): the new-engine adapter
 * then skips attaching its passive in-flight-turn observer stream, which only
 * a real conversation open (the default) should do.
 */
export interface HistoryLoadOptions {
  observe?: boolean;
}

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
      /**
       * Per-turn mode pin (composer "Mode" selector). `"plan"` pins a read-only
       * planning turn; `"auto"` (Autopilot) drops the blocking tools so the turn
       * runs fire-and-forget; `"execute"` (or omitted) is a normal turn. Distinct
       * from the legacy `mode`/`promptFile` opts above (Rust-era prompt profiles,
       * dropped at this boundary) — never collides with them.
       */
      modeOverride?: "execute" | "plan" | "auto";
      /** Resend of a prompt whose bubble is already in the feed (see SessionStartRequest). */
      suppressUserBubble?: boolean;
      /** Queue display (user's words + attachment names) if the send is held (see SessionStartRequest). */
      queuedPreview?: { text: string; attachmentNames?: string[] };
    },
  ) =>
    call<string>("send_message", async () => {
      // Send-time policy lives BELOW this call now: the engine adapter queues
      // a send whose conversation is still running (flushed at settle), and
      // the runtime itself owns provider-switch handoffs and context-full
      // autocompaction — this is a pure pass-through of named inputs.
      const res = await getEngine().startSession(agentPath, {
        sessionKey,
        prompt,
        source: "desktop",
        workingDir: opts?.workingDirOverride,
        provider: opts?.providerOverride,
        model: opts?.modelOverride,
        effort: opts?.effortOverride,
        mode: opts?.modeOverride,
        suppressUserBubble: opts?.suppressUserBubble,
        queuedPreview: opts?.queuedPreview,
      });
      return res.sessionKey;
    }),
  /** Drop one queued (not yet sent) message from a conversation's send queue. */
  removeQueued: (agentPath: string, sessionKey: string, id: string) =>
    getEngine().removeQueuedMessage(agentPath, sessionKey, id),
  startOnboarding: (agentPath: string, sessionKey: string) =>
    call<void>("start_onboarding_session", async () => {
      await getEngine().startOnboarding(agentPath, sessionKey);
    }),
  stop: (agentPath: string, sessionKey: string) =>
    call<void>("stop_session", async () => {
      await getEngine().cancelSession(agentPath, sessionKey);
    }),
  loadHistory: (
    agentPath: string,
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) =>
    // Warming agent: nothing is persisted yet and the read (plus the observer
    // stream it attaches) would be held for the whole warm-up. The open
    // conversation renders from the local VM (queued bubbles) meanwhile.
    isAgentPathWarming(agentPath)
      ? Promise.resolve<Array<{ feed_type: string; data: unknown }>>([])
      : call<Array<{ feed_type: string; data: unknown }>>(
          "load_chat_history",
          () => getEngine().loadChatHistory(agentPath, sessionKey, opts),
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
};

// ─── Agent-data files (`.houston/**`) ─────────────────────────────────

export const tauriAgent = {
  // Warming agent (HOU-693): every per-agent request is held until its
  // engine wakes. Reads answer instantly with "nothing yet" (a fresh agent
  // has no data; the ready-time events refetch the real state); writes open
  // the "almost ready" dialog and reject typed (never toasted).
  readFile: (agentPath: string, relPath: string) =>
    isAgentPathWarming(agentPath)
      ? Promise.resolve("")
      : call<string>("read_agent_file", () =>
          getEngine().readAgentFile(agentPath, relPath),
        ),
  writeFile: (
    agentPath: string,
    relPath: string,
    content: string,
    opts?: WarmingWriteOptions,
  ) => {
    // `allowWhileWarming` marks the app's OWN post-create setup writes
    // (provider/model config, the AI-routine seed): they intentionally ride
    // as held requests that land when the engine wakes (HOU-649). Only
    // user-initiated writes get the "almost ready" dialog.
    if (!opts?.allowWhileWarming) blockWriteWhileWarming(agentPath);
    return call<void>("write_agent_file", () =>
      getEngine().writeAgentFile(agentPath, relPath, content),
    );
  },
  seedSchemas: (agentPath: string) =>
    call<void>("seed_agent_schemas", () =>
      getEngine().seedAgentSchemas(agentPath),
    ),
  migrateFiles: (agentPath: string) =>
    call<void>("migrate_agent_files", () =>
      getEngine().migrateAgentFiles(agentPath),
    ),
};

// ─── Skills ───────────────────────────────────────────────────────────

export const tauriSkills = {
  list: (agentPath: string) =>
    isAgentPathWarming(agentPath)
      ? Promise.resolve<SkillSummary[]>([])
      : call<SkillSummary[]>("list_skills", async () =>
          (await getEngine().listSkills(agentPath)).map((s) => ({
            name: s.name,
            title: s.title ?? null,
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
      // toast or report it. Predicate form: the TS host's 404 carries no typed
      // `kind`, so `isMissingSkillError` reads the HoustonEngineError `.status`.
      { silence: isMissingSkillError },
    ),
  create: (
    agentPath: string,
    name: string,
    description: string,
    content: string,
  ) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("create_skill", () =>
      getEngine().createSkill({
        workspacePath: agentPath,
        name,
        description,
        content,
      }),
    );
  },
  delete: (agentPath: string, name: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("delete_skill", () =>
      getEngine().deleteSkill(agentPath, name),
    );
  },
  save: (agentPath: string, name: string, content: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("save_skill", () =>
      getEngine().saveSkill(name, { workspacePath: agentPath, content }),
    );
  },
  listFromRepo: (agentPath: string, source: string) =>
    call<RepoSkill[]>(
      "list_skills_from_repo",
      () => getEngine().listSkillsFromRepo(agentPath, source),
      undefined,
      // The Add Skills dialog renders repo failures (typo'd repo, private,
      // no skills) inline with plain-English copy — no red bug toast.
      { toast: false },
    ),
  installFromRepo: (agentPath: string, source: string, skills: RepoSkill[]) => {
    blockWriteWhileWarming(agentPath);
    return call<string[]>(
      "install_skills_from_repo",
      () =>
        getEngine().installSkillsFromRepo({
          workspacePath: agentPath,
          source,
          skills,
        }),
      undefined,
      { toast: false },
    );
  },
  searchCommunity: (agentPath: string, query: string, signal?: AbortSignal) =>
    call<CommunitySkillResult[]>(
      "search_community_skills",
      async () =>
        (await getEngine().searchCommunitySkills(agentPath, query, signal)).map(
          (s) => ({
            id: s.id,
            skillId: s.skillId,
            name: s.name,
            installs: s.installs,
            source: s.source,
          }),
        ),
      undefined,
      { toast: false },
    ),
  popularCommunity: (agentPath: string, signal?: AbortSignal) =>
    call<CommunitySkillResult[]>(
      "popular_community_skills",
      async () =>
        (await getEngine().popularCommunitySkills(agentPath, signal)).map(
          (s) => ({
            id: s.id,
            skillId: s.skillId,
            name: s.name,
            installs: s.installs,
            source: s.source,
          }),
        ),
      undefined,
      { toast: false },
    ),
  installCommunity: (
    agentPath: string,
    source: string,
    skillId: string,
    signal?: AbortSignal,
  ) => {
    blockWriteWhileWarming(agentPath);
    return call<string>(
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
    );
  },
};

// ─── Composio (desktop CLI connections) ───────────────────────────────

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
    call<ComposioStatus>("list_composio_connections", () =>
      getEngine().composioStatus(),
    ),
  listApps: () =>
    call<ComposioAppEntry[]>("list_composio_apps", async () =>
      (await getEngine().composioListApps()).map(
        (a: EngineComposioAppEntry) => ({
          toolkit: a.toolkit,
          name: a.name,
          description: a.description,
          logo_url: a.logo_url,
          categories: a.categories,
        }),
      ),
    ),
  listConnectedToolkits: () =>
    call<string[]>("list_composio_connected_toolkits", () =>
      getEngine().composioListConnections(),
    ),
  connectApp: (toolkit: string) =>
    call<StartLinkResponse>(
      "connect_composio_app",
      async () => {
        const r = await getEngine().composioConnectApp(toolkit);
        return {
          redirect_url: r.redirect_url,
          connected_account_id: r.connected_account_id,
          toolkit: r.toolkit,
        };
      },
      { toolkit },
      // "Already connected" is an expected state, not a Houston bug: the
      // caller refreshes the connected-toolkits list so the card flips to
      // connected (HOU-463). Silence it so it gets no red bug toast and no
      // Sentry report — the prior over-reporting was the source of this issue.
      { silenceKinds: [COMPOSIO_ALREADY_CONNECTED_KIND] },
    ),
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
    call<StartLoginResponse>(
      "start_composio_oauth",
      async () => {
        const r = await getEngine().composioStartLogin();
        return { login_url: r.login_url, cli_key: r.cli_key };
      },
      undefined,
      // "Already signed in" is a benign no-op (the CLI prints nothing when
      // creds already exist); the dialog handles that kind as success, so no
      // red bug toast and no Sentry report.
      { silenceKinds: ["composio_already_signed_in"] },
    ),
  completeLogin: (cliKey: string) =>
    call<void>(
      "complete_composio_login",
      () => getEngine().composioCompleteLogin(cliKey),
      undefined,
      // The sign-in dialog renders failures inline, so don't double-surface
      // as a toast. The expected `composio_login_timeout` (user closed the
      // tab) is fully silenced; genuine faults still capture to Sentry.
      { toast: false, silenceKinds: ["composio_login_timeout"] },
    ),
  logout: () =>
    call<void>("logout_composio", () => getEngine().composioLogout()),
  isCliInstalled: () =>
    call<boolean>("is_composio_cli_installed", () =>
      getEngine().composioCliInstalled(),
    ),
  installCli: () =>
    call<void>("install_composio_cli", () => getEngine().composioInstallCli()),
};

// ─── Project files (browser) ──────────────────────────────────────────

import { osOpenFile, osRevealAgent, osRevealFile } from "./os-bridge";

export const tauriFiles = {
  list: (agentPath: string) =>
    isAgentPathWarming(agentPath)
      ? Promise.resolve<FileEntry[]>([])
      : call<FileEntry[]>("list_project_files", async () =>
          (await getEngine().listProjectFiles(agentPath)).map((f) => ({
            path: f.path,
            name: f.name,
            extension: f.extension,
            size: f.size,
            is_directory: f.is_directory,
            dateModified: f.date_modified,
            dateCreated: f.date_created,
          })),
        ),
  open: (agentPath: string, relativePath: string) =>
    osOpenFile(agentPath, relativePath),
  reveal: (agentPath: string, relativePath: string) =>
    osRevealFile(agentPath, relativePath),
  /** Raw bytes over HTTP — powers in-browser preview + download (web build).
   *  Pass `{ toast: false }` when the caller renders the failure inline. */
  download: (
    agentPath: string,
    relativePath: string,
    options?: { toast?: boolean },
  ) =>
    call<{ blob: Blob; contentType: string }>(
      "download_project_file",
      () => getEngine().downloadProjectFile(agentPath, relativePath),
      { agentPath, relativePath },
      options,
    ),
  delete: (agentPath: string, relativePath: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("delete_file", () =>
      getEngine().deleteFile(agentPath, relativePath),
    );
  },
  rename: (agentPath: string, relativePath: string, newName: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("rename_file", () =>
      getEngine().renameFile(agentPath, relativePath, newName),
    );
  },
  createFolder: (agentPath: string, name: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("create_agent_folder", async () => {
      await getEngine().createFolder(agentPath, name);
    });
  },
  /** Upload browser Files into the workspace (drag-drop / Browse), optionally
   * into a subfolder. */
  upload: (agentPath: string, files: File[], targetDir?: string | null) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("upload_project_files", () =>
      getEngine().uploadProjectFiles(agentPath, files, targetDir),
    );
  },
  /** Move a file/folder into another folder (null = workspace root). */
  move: (agentPath: string, relPath: string, toDir: string | null) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("move_project_file", () =>
      getEngine().moveProjectFile(agentPath, relPath, toDir),
    );
  },
  /** One zip of the whole workspace ("Download all") or, with `relPath`, of a
   * single folder — where there is no local file manager to reveal in (cloud
   * pods, web builds). */
  downloadArchive: (agentPath: string, relPath?: string) =>
    call<{ blob: Blob; contentType: string }>(
      "download_project_archive",
      () => getEngine().downloadProjectArchive(agentPath, relPath),
      { agentPath, relPath },
    ),
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
}

export const tauriConversations = {
  list: (agentPath: string) =>
    isAgentPathWarming(agentPath)
      ? Promise.resolve<RawConversation[]>([])
      : call<RawConversation[]>("list_conversations", async () =>
          (await getEngine().listConversations(agentPath)).map(
            conversationToRaw,
          ),
        ),
  listAll: (agentPaths: string[]) => {
    // A warming agent has no conversations yet and its read would hold the
    // whole bulk scan — sweep only the reachable agents.
    const reachable = agentPaths.filter((p) => !isAgentPathWarming(p));
    if (reachable.length === 0) return Promise.resolve<RawConversation[]>([]);
    return call<RawConversation[]>("list_all_conversations", async () =>
      (await getEngine().listAllConversations(reachable)).map(
        conversationToRaw,
      ),
    );
  },
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
  };
}

// ─── Routines (engine-backed: CRUD + scheduler) ───────────────────────

import type {
  NewActivity as EngineNewActivity,
  NewRoutine as EngineNewRoutine,
  RoutineUpdate as EngineRoutineUpdate,
} from "@houston-ai/engine-client";
import * as activityData from "../data/activity";
import * as configData from "../data/config";

export const tauriRoutines = {
  list: (agentPath: string) =>
    isAgentPathWarming(agentPath)
      ? Promise.resolve([])
      : call("list_routines", () => getEngine().listRoutines(agentPath)),
  create: (
    agentPath: string,
    input: EngineNewRoutine,
    opts?: WarmingWriteOptions,
  ) => {
    if (!opts?.allowWhileWarming) blockWriteWhileWarming(agentPath);
    return call("create_routine", () =>
      getEngine().createRoutine(agentPath, input),
    );
  },
  update: (
    agentPath: string,
    routineId: string,
    updates: EngineRoutineUpdate,
  ) => {
    blockWriteWhileWarming(agentPath);
    return call("update_routine", () =>
      getEngine().updateRoutine(agentPath, routineId, updates),
    );
  },
  delete: (agentPath: string, routineId: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("delete_routine", () =>
      getEngine().deleteRoutine(agentPath, routineId),
    );
  },
  listRuns: (agentPath: string, routineId?: string) =>
    isAgentPathWarming(agentPath)
      ? Promise.resolve([])
      : call("list_routine_runs", () =>
          getEngine().listRoutineRuns(agentPath, routineId),
        ),
  runNow: (agentPath: string, routineId: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("run_routine_now", () =>
      getEngine().runRoutineNow(agentPath, routineId),
    );
  },
  cancelRun: (agentPath: string, routineId: string, runId: string) => {
    blockWriteWhileWarming(agentPath);
    return call("cancel_routine_run", () =>
      getEngine().cancelRoutineRun(agentPath, routineId, runId),
    );
  },
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
    provider?: string,
    model?: string,
  ) =>
    activityData.create(
      agentPath,
      title,
      description ?? "",
      agent,
      provider,
      model,
    ),
  /**
   * Create the row through the host's single POST (which honors a
   * client-generated id) instead of the data layer's read-modify-write pair.
   * Used by the warming-engine mission flow (HOU-693): one request, queued
   * ahead of the turn start, so the row exists before the turn's first
   * board-status write once the engine wakes. `toast:false` — the caller
   * surfaces the failure in its own flow.
   */
  createWithId: (agentPath: string, input: EngineNewActivity) =>
    call(
      "create_activity",
      () => getEngine().createActivity(agentPath, input),
      undefined,
      { toast: false },
    ),
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

// ─── Agent config (per-agent JSON on disk) ────────────────────────────

export const tauriConfig = {
  read: (agentPath: string) => configData.read(agentPath),
  write: (
    agentPath: string,
    config: configData.Config,
    opts?: WarmingWriteOptions,
  ) => configData.write(agentPath, config, opts),
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
  /**
   * The provider's configured model id, when the engine reports one — carries
   * the OpenAI-compatible (local) provider's dynamic, catalog-less model so the
   * chat model picker can show + select it. Absent for catalog-backed providers.
   */
  active_model?: string;
}

/**
 * Pick the connected gateway for a card that spans several engine gateway ids —
 * OpenCode's Zen + Go share one key, so the merged "OpenCode" account reads as
 * connected when EITHER gateway is. Returns the first authenticated probe, else
 * the first probe present. `byId` is a `checkAllStatuses` result; `[p.id]` for a
 * normal single-gateway provider just returns its own probe.
 */
export function mergeGatewayStatus(
  gatewayIds: readonly string[],
  byId: Record<string, ProviderStatus>,
): ProviderStatus | undefined {
  const probes = gatewayIds
    .map((id) => byId[id])
    .filter((s): s is ProviderStatus => Boolean(s));
  return probes.find((s) => s.cli_installed && s.authenticated) ?? probes[0];
}

const DEFAULT_PROVIDER_PREF_KEY = "default_provider";
const DEFAULT_MODEL_PREF_KEY = "default_model";

export const tauriProvider = {
  checkStatus: (provider: string) =>
    call<ProviderStatus>("check_provider_status", async () => {
      const p: EngineProviderStatus =
        await getEngine().providerStatus(provider);
      return {
        provider: p.provider,
        cli_installed: p.cliInstalled,
        auth_state: p.authState,
        authenticated: p.authState === "authenticated",
        cli_name: p.cliName,
        active_model: p.activeModel,
      };
    }),
  /**
   * Connect status for many provider / gateway ids in ONE engine round-trip.
   *
   * The new TS engine's adapter exposes a batched `providerStatuses()` that
   * resolves every card from a single `listProviders()` call (HOU-650). The
   * legacy Rust client has no such method — and won't get one, it's being
   * retired — so we feature-detect it and fall back to per-provider probes there
   * (that path keeps its old N-round-trip behavior; no Rust-side change). Returns
   * a map keyed by the ids passed. Screens that show several provider cards
   * (settings, onboarding picker, chat model picker) call this once instead of
   * probing each card separately.
   */
  checkAllStatuses: (ids: readonly string[]) =>
    call<Record<string, ProviderStatus>>(
      "check_provider_statuses",
      async () => {
        const engine = getEngine() as {
          providerStatus: (name: string) => Promise<EngineProviderStatus>;
          providerStatuses?: (
            names: readonly string[],
          ) => Promise<EngineProviderStatus[]>;
        };
        const list = engine.providerStatuses
          ? await engine.providerStatuses([...ids])
          : await Promise.all(ids.map((id) => engine.providerStatus(id)));
        const out: Record<string, ProviderStatus> = {};
        ids.forEach((id, i) => {
          const p = list[i];
          if (!p) return;
          out[id] = {
            provider: p.provider,
            cli_installed: p.cliInstalled,
            auth_state: p.authState,
            authenticated: p.authState === "authenticated",
            cli_name: p.cliName,
            active_model: p.activeModel,
          };
        });
        return out;
      },
    ),
  getDefault: () =>
    call<string>(
      "get_default_provider",
      async () =>
        (await getEngine().getPreference(DEFAULT_PROVIDER_PREF_KEY)) ?? "",
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
        return {
          provider: provider ?? null,
          model: normalizeLegacyModel(model),
        };
      },
    ),
  setLastUsed: (provider: string, model: string) =>
    call<void>("set_last_used_provider", async () => {
      const eng = getEngine();
      await eng.setPreference(DEFAULT_PROVIDER_PREF_KEY, provider);
      await eng.setPreference(DEFAULT_MODEL_PREF_KEY, model);
    }),
  launchLogin: (
    provider: string,
    opts?: { deviceAuth?: boolean; toast?: boolean; enterpriseDomain?: string },
  ) =>
    // `deviceAuth` declares whether the client can catch a loopback OAuth
    // callback. Default it from connection topology: a co-located desktop can
    // catch the runtime's loopback callback (false → Codex browser login), but
    // any browser client OR desktop pointed at a remote host cannot (true →
    // device code). Callers may still override. Centralized here so every entry
    // point (picker, settings, reconnect card, banner) agrees.
    // `enterpriseDomain` (GitHub Copilot Enterprise) carries the company GitHub
    // domain the user typed on the Enterprise card; absent for every other login.
    call<void>(
      "launch_provider_login",
      () => {
        // Anthropic on a co-located desktop runs the zero-terminal browser login
        // FOR the user (native `claude auth login`), never the runtime's
        // setup-token paste flow. This is the single choke point every connect
        // surface funnels through, so the intercept lives here (not per-surface).
        // beginClaudeBrowserLogin drives the whole flow and reports the outcome
        // as a synthetic ProviderLoginComplete, so `call` resolves and never
        // double-toasts. On a REMOTE-engine desktop it also extracts + pushes the
        // credential to the pod (and degrades to the paste flow on any failure).
        // Web (non-Tauri) falls through to providerLogin.
        if (
          shouldUseClaudeDesktopLogin({
            provider,
            isTauri: osIsTauri(),
          })
        ) {
          return beginClaudeBrowserLogin(provider);
        }
        return getEngine().providerLogin(provider, {
          deviceAuth:
            opts?.deviceAuth ??
            // Codex/OpenAI on a Tauri desktop against a REMOTE engine uses the
            // zero-code loopback relay (`codexUsesLoopbackRelay`): the desktop
            // binds its OWN local 127.0.0.1:1455 and relays the callback code,
            // so it wants an authorize URL (deviceAuth:false), never a device
            // code. pi's own 1455 is in the pod, so no collision. Co-located
            // desktop (local sidecar / loopback dev URL) is NOT a relay case —
            // pi owns 1455 there and its own browser flow already resolves to
            // deviceAuth:false via the topology default below.
            (provider === "openai" &&
            codexUsesLoopbackRelay(
              (import.meta.env ?? {}) as {
                VITE_NEW_ENGINE_URL?: string;
                VITE_HOSTED_ENGINE_URL?: string;
              },
              { isTauri: osIsTauri() },
            )
              ? false
              : // The browser/loopback flow needs the runtime CO-LOCATED with
                // the user's browser: pi binds the provider's fixed localhost
                // callback port in-process and completes the exchange itself, so
                // the client only opens the URL. A truly remote engine (hosted
                // cloud, a VPS, or the HOU-621 runtime `remote` choice with no
                // baked env — hence the isRemoteEngine() OR) must use device
                // code instead. A LOOPBACK `VITE_NEW_ENGINE_URL` (the dev
                // two-terminal setup) is co-located despite being URL-configured,
                // so it keeps the browser flow like the packaged host-sidecar
                // build.
                (isRemoteEngine() &&
                  !isLoopbackHostUrl(
                    import.meta.env?.VITE_NEW_ENGINE_URL as string | undefined,
                  )) ||
                providerLoginUsesDeviceAuthByDefault(
                  (import.meta.env ?? {}) as {
                    VITE_NEW_ENGINE_URL?: string;
                    VITE_HOSTED_ENGINE_URL?: string;
                  },
                  { isTauri: osIsTauri() },
                )),
          enterpriseDomain: opts?.enterpriseDomain,
        });
      },
      undefined,
      // Callers that render their OWN failure toast (the picker, settings) pass
      // `toast: false` so `call`'s generic toast does not fire on top of theirs
      // — the engine error message showed twice otherwise. Sentry capture still
      // happens. Callers that surface the failure inline (reconnect cards /
      // banner) omit it and keep this toast.
      opts?.toast === false ? { toast: false } : undefined,
    ),
  launchLogout: (provider: string) =>
    call<void>("launch_provider_logout", () =>
      getEngine().providerLogout(provider),
    ),
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
    call<void>("cancel_provider_login", () => {
      // Anthropic on the desktop ran the native browser login (not the runtime),
      // so its cancel must kill THAT child — the runtime's cancelProviderLogin
      // would be a no-op and leave the `claude` helper running. Mirror the
      // launchLogin intercept.
      if (shouldUseClaudeDesktopLogin({ provider, isTauri: osIsTauri() })) {
        cancelClaudeBrowserLogin(provider);
        return Promise.resolve();
      }
      return getEngine().cancelProviderLogin(provider);
    }),
  /**
   * Connect an API-key provider (OpenRouter, Google Gemini, Amazon Bedrock,
   * OpenCode Zen / Go):
   * submit the pasted key. The new engine stores it for the workspace and the
   * provider reads as connected (the adapter fires `ProviderLoginComplete`).
   * New-engine only — the connect UI shows these providers only when
   * `newEngineActive()`.
   */
  setApiKey: (provider: string, apiKey: string) =>
    call<void>("set_provider_api_key", () =>
      getEngine().setProviderApiKey(provider, apiKey),
    ),
  /**
   * Connect an OpenAI-compatible (local / BYO model) server: a base URL + model
   * id the user runs themselves (Ollama / vLLM / LM Studio). New-engine only and
   * gated by the host's `openaiCompatible` capability — the connect UI shows it
   * only then (see `getVisibleProviders`).
   */
  setCustomEndpoint: (endpoint: CustomEndpoint) =>
    call<void>("set_provider_custom_endpoint", () =>
      getEngine().setProviderCustomEndpoint(endpoint),
    ),
  /**
   * Mint a relay credential for the guided "connect a local model" flow: the
   * gateway issues a short-lived tunnel token the desktop's frpc sidecar uses to
   * expose the user's local model server to their CLOUD agent. Hosted + new
   * engine only. A failure toasts the real reason with a Report-bug affordance
   * (default `call` surfacing); the guided dialog also shows a calm retry state.
   */
  getTunnelCredentials: () =>
    call<import("@houston-ai/engine-client").TunnelCredentials>(
      "get_tunnel_credentials",
      () => getEngine().getTunnelCredentials(),
    ),
  /**
   * Save a Gemini API key to `~/.gemini/.env` via the engine (legacy Rust /
   * desktop path). Errors surface through `call`'s standard rejection path;
   * the caller renders them with `errorMessage(err)` + `addToast`.
   *
   * On the new engine, API-key providers (Gemini included) go through
   * `setApiKey` instead. Never log `apiKey` — it's a SECRET.
   */
  setGeminiApiKey: (apiKey: string) =>
    call<void>("set_gemini_api_key", () => getEngine().setGeminiApiKey(apiKey)),
};

// ─── System (OS-native helpers, preserved for back-compat) ────────────

import { osOpenUrl } from "./os-bridge";
export const tauriSystem = {
  openUrl: (url: string) => osOpenUrl(url),
  /**
   * Whether THIS install carried over a legacy Rust-desktop chat-history db —
   * the signal that the user is migrating from the old desktop build (agents +
   * history came across, provider credentials did NOT). Read from the host's
   * `/v1/version`; the legacy Rust engine and older hosts omit the field, so a
   * missing value reads as `false` (never show the reconnect moment there).
   */
  chatHistoryMigrated: () =>
    call<boolean>(
      "chat_history_migrated",
      async () => (await getEngine().version()).chatHistoryMigrated ?? false,
      undefined,
      // A meta probe, not a user-initiated action: a transient failure should
      // not toast. The hook treats a throw as "unknown → don't show".
      { toast: false, capture: false },
    ),
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
    call<void>("start_agent_watcher", () =>
      getEngine().startAgentWatcher(agentPath),
    ),
  stop: () =>
    call<void>("stop_agent_watcher", () => getEngine().stopAgentWatcher()),
};

// ─── Tunnel (mobile pairing) ──────────────────────────────────────────

import type {
  PairingCode as EnginePairingCode,
  TunnelStatus as EngineTunnelStatus,
} from "@houston-ai/engine-client";

export const tauriTunnel = {
  status: () =>
    call<EngineTunnelStatus>("tunnel_status", () => getEngine().tunnelStatus()),
  mintPairingCode: () =>
    call<EnginePairingCode>("tunnel_mint_pairing", () =>
      getEngine().mintPairingCode(),
    ),
  resetAccess: () =>
    call<EnginePairingCode>("tunnel_reset_access", () =>
      getEngine().resetPhoneAccess(),
    ),
};

/**
 * Integrations (Composio, platform mode). The user never creates a provider
 * account — they only OAuth apps (Gmail, Slack…); Houston's platform key lives
 * server-side. Host-only — these reach the v3 host's /v1/integrations routes;
 * the tab is gated to the control-plane build so they never run on the legacy
 * Rust wire. Types flow by inference.
 */
export const tauriIntegrations = {
  status: () =>
    call("integration_status", () => getEngine().integrationStatus()),
  setSession: (token: string | null) =>
    call("integration_session", () => getEngine().setIntegrationSession(token)),
  toolkits: (provider: string) =>
    call("integration_toolkits", () =>
      getEngine().integrationToolkits(provider),
    ),
  connections: (provider: string) =>
    call("integration_connections", () =>
      getEngine().integrationConnections(provider),
    ),
  /** Begin an app connection. `agent` (the agent slug) scopes the connect to a
   *  per-agent surface so the gateway applies the agent's allowlist + auto-grant
   *  (Teams v2); omit it for the account-level Integrations page. */
  connect: (provider: string, toolkit: string, agent?: string) =>
    call("integration_connect", () =>
      getEngine().connectIntegration(provider, toolkit, agent),
    ),
  connection: (provider: string, connectionId: string) =>
    call("integration_connection", () =>
      getEngine().integrationConnection(provider, connectionId),
    ),
  disconnect: (provider: string, toolkit: string) =>
    call("integration_disconnect", () =>
      getEngine().disconnectIntegration(provider, toolkit),
    ),
  /** Dismiss the reconnect notice (deletes the legacy credentials server-side). */
  dismissReconnectNotice: () =>
    call("integration_dismiss_reconnect_notice", () =>
      getEngine().dismissIntegrationsReconnectNotice(),
    ),
  /** Multiplayer: the integration toolkit slugs granted to an agent. */
  grants: (agentSlugOrId: string) =>
    call("agent_integration_grants", () =>
      getEngine().agentIntegrationGrants(agentSlugOrId),
    ),
  /** Multiplayer: replace the integration toolkit slugs granted to an agent. */
  setGrants: (agentSlugOrId: string, toolkits: string[]) =>
    call("set_agent_integration_grants", () =>
      getEngine().setAgentIntegrationGrants(agentSlugOrId, toolkits),
    ),
};

/**
 * Multiplayer org management. Hosted-gateway only: the desktop/local engine has
 * no /v1/org routes, so `getEngine()` throws "multiplayer requires the hosted
 * gateway" there — callers gate the UI on the `multiplayer` capability. Same
 * `call()` surfacing as every other wrapper; types flow by inference.
 */
export const tauriOrg = {
  get: () => call("get_org", () => getEngine().getOrg()),
  addMember: (
    email: string,
    role: import("@houston-ai/engine-client").OrgRole,
  ) => call("add_org_member", () => getEngine().addOrgMember(email, role)),
  /** Revoke a pending invite by id (owner only). */
  deleteInvite: (inviteId: string) =>
    call<void>("delete_org_invite", () =>
      getEngine().deleteOrgInvite(inviteId),
    ),
  removeMember: (userId: string) =>
    call("remove_org_member", () => getEngine().removeOrgMember(userId)),
  setMemberRole: (
    userId: string,
    role: import("@houston-ai/engine-client").OrgRole,
  ) =>
    call("set_org_member_role", () =>
      getEngine().setOrgMemberRole(userId, role),
    ),
  /** Org audit log, newest first, paged by `before` cursor (owner org-wide;
   *  admin their managed agents; plain members 403). */
  audit: (opts: { before?: number; limit?: number } = {}) =>
    call("org_audit", () => getEngine().orgAudit(opts)),
  /** Per-agent/user usage counters over the last `days` (owner org-wide; admin
   *  their managed agents; plain members 403). */
  usage: (days: number) => call("org_usage", () => getEngine().orgUsage(days)),
};
