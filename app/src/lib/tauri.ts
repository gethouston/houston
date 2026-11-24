import type {
  AddCustomIntegrationInput,
  BillingChoicePick,
  CredentialScope,
  CustomEndpoint,
  EditableProfileUpdate,
  ProviderStatus as EngineProviderStatus,
  FileUploadOptions,
  MessageApproval,
  MessageMention,
  MissionTitle,
  ProviderAuthState,
  ProviderHealth,
  ProviderUsage,
  SkillsManifest,
} from "@houston/engine-adapter";
import type {
  GrantableOperation,
  IntegrationProviderId,
} from "@houston/protocol";
import type {
  DismissInteractionOutcome,
  FilesModule,
  TimezoneSeedResult,
} from "@houston/sdk";
import { integrationConnectRefusal } from "@houston/sdk/integrations/connect-refusal";
import type {
  PushDeviceRegistration,
  SlackConnectReturn,
} from "@houston/wire-types";
import { shouldUseClaudeDesktopLogin } from "../components/shell/provider-login-url";
import { actingUser } from "./acting-user";
import { isAgentGoneError, isStaleRosterReadError } from "./agent-gone";
import {
  blockWriteWhileWarming,
  isAgentPathCreating,
  type WarmingWriteOptions,
} from "./agent-warming-guard";
import { isApiKeyUserRejection } from "./api-key-connect-error";
import { isKeyGoneError, isKeyLimitError } from "./api-keys-model";
import { isAssistantUnavailableError } from "./assistant-availability";
import { type ChannelCall, silenceChannelCall } from "./channel-silence";
import {
  beginClaudeBrowserLogin,
  cancelClaudeBrowserLogin,
} from "./claude-login";
import {
  classifyCloudEgressRejection,
  cloudEgressBodyKey,
  isCloudEgressBlockedError,
} from "./cloud-egress-blocked-error";
import { cancelCodexLoopback } from "./codex-loopback";
import { describeError } from "./describe-error";
import { getEngine, isRemoteEngine } from "./engine";
import { engineCallSurface } from "./engine-call-policy";
import {
  codexUsesLoopbackRelay,
  isLoopbackHostUrl,
  providerLoginUsesDeviceAuthByDefault,
} from "./engine-mode";
import { isNameTakenError } from "./file-conflicts";
import { isFileGoneError } from "./file-gone";
import { isUploadTooLargeError } from "./files-upload-limits";
import i18n from "./i18n";
import { isIntegrationConnectionGoneError } from "./integration-connection-gone";
import { logger } from "./logger";
import { isExpectedMemberRoutinesRefusal } from "./member-routines-refusal";
import { isMissingSkillError } from "./missing-skill";
import { isModelNotAllowedError } from "./model-not-allowed";
import { isNetworkTransportError } from "./network-transport-error";
import { isNoAgentForProviderWriteError } from "./no-agent-provider-write-error";
import { isOrgAdminRequiredError } from "./org-admin-required-error";
import { osIsTauri } from "./os-bridge";
import { surfacePlanMessageLimit } from "./plan-message-limit";
import { surfacePlanMinInterval } from "./plan-min-interval";
import { isProviderLoginSessionLostError } from "./provider-login-session-lost";
import { toDisplayProviderIdOrNull } from "./provider-overrides";
import { normalizeLegacyModel } from "./providers";
import { canPurchaseInApp } from "./purchase-policy";
import { classifyQuietError } from "./quiet-error-class";
import { healStaleRosterFromError } from "./roster-heal";
import { isSharedSkillsUnconfiguredError } from "./shared-skills-availability";
import { isStaleAttachmentError } from "./stale-attachment";
import {
  isLastOwnerError,
  isNeedsUpgradeError,
  isPersonalSpaceError,
} from "./team-status-model";
import type { FileEntry, SkillDetail, SkillSummary, Workspace } from "./types";
import { trackAttachmentUpload } from "./upload-progress";
import { markToldUser } from "./user-told-mark";

export { withAttachmentPaths } from "./attachment-message";

export interface EngineCallOptions {
  toast?: boolean;
  capture?: boolean;
  silence?: (err: unknown) => boolean;
  surface?: boolean;
}

export type CustomEndpointSurface = "toast" | "inline";

async function call<T>(
  label: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
  options?: EngineCallOptions,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (await surfaceError(label, err, context, options)) markToldUser(err);
    throw err;
  }
}

export { call as engineCall };

export function passiveAgentRead<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  return call<T>(label, fn, undefined, {
    silence: isStaleRosterReadError,
  }).catch((err) => {
    healStaleRosterFromError(err);
    throw err;
  });
}

export async function surfaceEngineError(
  label: string,
  err: unknown,
  context?: Record<string, unknown>,
  options?: Pick<EngineCallOptions, "silence" | "toast">,
): Promise<void> {
  if (await surfaceError(label, err, context, options)) markToldUser(err);
}

async function surfaceError(
  label: string,
  err: unknown,
  context?: Record<string, unknown>,
  options?: EngineCallOptions,
): Promise<boolean> {
  const message = describeError(err);
  logger.error(
    `[engine:${label}] ${message}`,
    context ? JSON.stringify(context) : undefined,
  );

  if (options?.surface === false) return false;

  if (options?.silence?.(err)) return false;

  if (await surfacePlanMessageLimit(err)) return true;
  if (surfacePlanMinInterval(err)) return true;

  if (isNeedsUpgradeError(err)) {
    const { showExpectedStateToast } = await import("./error-toast");
    const purchasable = canPurchaseInApp();
    showExpectedStateToast(
      purchasable
        ? i18n.t("teams:degrade.writeBlockedTitle")
        : i18n.t("teams:native.writeBlockedTitle"),
      purchasable
        ? i18n.t("teams:degrade.writeBlockedBody")
        : i18n.t("teams:native.writeBlockedBody"),
    );
    return true;
  }

  if (isPersonalSpaceError(err)) {
    const { showExpectedStateToast } = await import("./error-toast");
    showExpectedStateToast(
      i18n.t("teams:personalSpace.inviteBlockedTitle"),
      i18n.t("teams:personalSpace.inviteBlockedBody"),
    );
    return true;
  }

  if (isLastOwnerError(err)) {
    const { showExpectedStateToast } = await import("./error-toast");
    showExpectedStateToast(
      i18n.t("teams:people.lastOwner.title"),
      i18n.t("teams:people.lastOwner.body"),
    );
    return true;
  }

  if (isNoAgentForProviderWriteError(err)) {
    const { showExpectedStateToast } = await import("./error-toast");
    showExpectedStateToast(
      i18n.t("shell:errorToast.noAgentTitle"),
      i18n.t("shell:errorToast.noAgentDescription"),
    );
    return true;
  }

  if (isOrgAdminRequiredError(err)) {
    const { showExpectedStateToast } = await import("./error-toast");
    showExpectedStateToast(
      i18n.t("providers:toast.orgAdminRequiredTitle"),
      i18n.t("providers:toast.orgAdminRequiredBody"),
    );
    return true;
  }

  const egress = classifyCloudEgressRejection(err);
  if (egress) {
    const { showExpectedStateToast } = await import("./error-toast");
    showExpectedStateToast(
      i18n.t("providers:openaiCompatible.cloudOnly.title"),
      i18n.t(`providers:${cloudEgressBodyKey(egress)}`),
    );
    return true;
  }

  const { toast: shouldToast, capture: shouldCapture } = engineCallSurface(
    err instanceof Error ? err.name : undefined,
    options,
  );
  if (!shouldToast && !shouldCapture) return false;

  if (isNetworkTransportError(err)) {
    const { showConnectivityErrorToast } = await import("./error-toast");
    showConnectivityErrorToast(label, message, err);
    return true;
  }

  if (classifyQuietError(err) === "engine_waking") {
    const { showEngineWakingToast } = await import("./error-toast");
    showEngineWakingToast(label, message, err, context);
    return true;
  }

  const [{ showErrorToast }, { reportError }] = await Promise.all([
    import("./error-toast"),
    import("./error-report"),
  ]);
  if (shouldToast) {
    return showErrorToast(label, message, err);
  }
  reportError(label, message, err);
  return false;
}

// ─── Workspaces ────────────────────────────────────────────────────────

export const tauriWorkspaces = {
  list: () =>
    call<Workspace[]>("list_workspaces", () => getEngine().listWorkspaces()),
  listQuiet: () =>
    call<Workspace[]>(
      "list_workspaces",
      () => getEngine().listWorkspaces(),
      undefined,
      { surface: false },
    ),
  create: (name: string) =>
    call<Workspace>("create_workspace", () =>
      getEngine().createWorkspace({ name }),
    ),
  delete: (id: string, options?: EngineCallOptions) =>
    call<void>(
      "delete_workspace",
      () => getEngine().deleteWorkspace(id),
      undefined,
      options,
    ),
  setLocale: (id: string, locale: string | null) =>
    call<Workspace>("set_workspace_locale", () =>
      getEngine().setWorkspaceLocale(id, locale),
    ),
};

export const tauriAgentSettings = {
  get: (agentSlugOrId: string) =>
    call("get_agent_settings", () =>
      getEngine().getAgentSettings(agentSlugOrId),
    ),
  getQuiet: (agentSlugOrId: string) =>
    call(
      "get_agent_settings",
      () => getEngine().getAgentSettings(agentSlugOrId),
      undefined,
      { surface: false },
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

export const tauriAgentModelChoice = {
  get: (agentSlugOrId: string) =>
    call("get_agent_model_choice", () =>
      getEngine().getAgentModelChoice(agentSlugOrId),
    ),
  set: (
    agentSlugOrId: string,
    choice: import("@houston/engine-adapter").AgentModelChoice,
  ) =>
    call<void>(
      "set_agent_model_choice",
      () => getEngine().setAgentModelChoice(agentSlugOrId, choice),
      undefined,
      { silence: isModelNotAllowedError },
    ),
};

export interface HistoryLoadOptions {
  observe?: boolean;
}

export const tauriChat = {
  send: (
    agentPath: string,
    prompt: string,
    sessionKey: string,
    opts?: {
      workingDirOverride?: string;
      providerOverride?: string;
      modelOverride?: string;
      effortOverride?: string;
      modeOverride?: "execute" | "plan" | "auto";
      suppressUserBubble?: boolean;
      queuedPreview?: { text: string; attachmentNames?: string[] };
      autoResume?: boolean;
      displayText?: string;
      mentions?: MessageMention[];
      approvals?: MessageApproval[];
      missionTitle?: MissionTitle;
      grants?: GrantableOperation[];
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
        mode: opts?.modeOverride,
        suppressUserBubble: opts?.suppressUserBubble,
        queuedPreview: opts?.queuedPreview,
        displayText: opts?.displayText,
        autoResume: opts?.autoResume,
        author: actingUser(),
        mentions: opts?.mentions?.length ? opts.mentions : undefined,
        approvals: opts?.approvals?.length ? opts.approvals : undefined,
        missionTitle: opts?.missionTitle,
        grants: opts?.grants?.length ? opts.grants : undefined,
      });
      return res.sessionKey;
    }),
  removeQueued: (agentPath: string, sessionKey: string, id: string) =>
    getEngine().removeQueuedMessage(agentPath, sessionKey, id),
  stop: (agentPath: string, sessionKey: string) =>
    call<void>("stop_session", async () => {
      await getEngine().cancelSession(agentPath, sessionKey);
    }),
  setLiveTurnMode: (
    agentPath: string,
    sessionKey: string,
    mode: "execute" | "plan" | "auto",
  ) => getEngine().setLiveTurnMode(agentPath, sessionKey, mode),
  dismissInteraction: (agentPath: string, conversationId: string) =>
    call<DismissInteractionOutcome>("dismiss_interaction", () =>
      getEngine().dismissInteraction(agentPath, conversationId),
    ),
  truncate: (agentPath: string, conversationId: string, turnId: string) =>
    call<void>("truncate_conversation", () =>
      getEngine().truncateConversation(agentPath, conversationId, turnId),
    ),
  loadHistory: (
    agentPath: string,
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) =>
    isAgentPathCreating(agentPath)
      ? Promise.resolve<Array<{ feed_type: string; data: unknown }>>([])
      : call<Array<{ feed_type: string; data: unknown }>>(
          "load_chat_history",
          () => getEngine().loadChatHistory(agentPath, sessionKey, opts),
        ),
  loadOlderHistory: (agentPath: string, sessionKey: string) =>
    call<{ hasOlder: boolean }>("load_older_chat_history", () =>
      getEngine().loadOlderChatHistory(agentPath, sessionKey),
    ),
};

export const tauriAttachments = {
  save: async (
    agentPath: string,
    scopeId: string,
    files: File[],
    opts?: FileUploadOptions,
  ): Promise<string[]> => {
    if (files.length === 0) return [];
    return trackAttachmentUpload(files, (onProgress) =>
      call<string[]>(
        "save_attachments",
        () =>
          getEngine().saveAttachments(agentPath, scopeId, files, {
            ...opts,
            onProgress: (file, progress) => {
              onProgress(file, progress);
              opts?.onProgress?.(file, progress);
            },
          }),
        undefined,
        { silence: isStaleAttachmentError },
      ),
    );
  },
};

export const tauriAgent = {
  readFile: (agentPath: string, relPath: string) =>
    isAgentPathCreating(agentPath)
      ? Promise.resolve("")
      : passiveAgentRead<string>("read_agent_file", () =>
          getEngine().readAgentFile(agentPath, relPath),
        ),
  writeFile: (
    agentPath: string,
    relPath: string,
    content: string,
    opts?: WarmingWriteOptions,
  ) => {
    if (!opts?.allowWhileWarming) blockWriteWhileWarming(agentPath);
    return call<void>("write_agent_file", () =>
      getEngine().writeAgentFile(agentPath, relPath, content),
    );
  },
};

export const tauriSkills = {
  list: (agentPath: string) =>
    isAgentPathCreating(agentPath)
      ? Promise.resolve<SkillSummary[]>([])
      : passiveAgentRead<SkillSummary[]>("list_skills", async () =>
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
            setup_activity_id: s.setupActivityId ?? null,
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
};

export const tauriSharedSkills = {
  list: async (workspaceId: string) => {
    try {
      const result = await call(
        "list_shared_skills",
        () => getEngine().listSharedSkills(workspaceId),
        undefined,
        { silence: isSharedSkillsUnconfiguredError },
      );
      return {
        configured: true,
        diagnostics: result.diagnostics,
        items: result.items.map((s) => ({
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
          setup_activity_id: s.setupActivityId ?? null,
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
      };
    } catch (err) {
      if (!isSharedSkillsUnconfiguredError(err)) throw err;
      return { configured: false, diagnostics: [], items: [] };
    }
  },
  load: (workspaceId: string, slug: string) =>
    call<SkillDetail>("load_shared_skill", () =>
      getEngine().loadSharedSkill(workspaceId, slug),
    ),
  save: (workspaceId: string, slug: string, content: string) =>
    call<void>("save_shared_skill", () =>
      getEngine().saveSharedSkill(workspaceId, slug, {
        workspacePath: workspaceId,
        content,
      }),
    ),
  promote: (
    workspaceId: string,
    slug: string,
    content: string,
    options?: EngineCallOptions,
  ) =>
    call<SkillDetail>(
      "promote_shared_skill",
      () => getEngine().promoteSharedSkill(workspaceId, slug, content),
      undefined,
      options,
    ),
  delete: (workspaceId: string, slug: string) =>
    call<void>("delete_shared_skill", () =>
      getEngine().deleteSharedSkill(workspaceId, slug),
    ),
};

export const tauriSkillsManifest = {
  get: (agentPath: string, options?: EngineCallOptions) =>
    call<SkillsManifest>(
      "get_skills_manifest",
      () => getEngine().getSkillsManifest(agentPath),
      undefined,
      options,
    ),
  set: (agentPath: string, manifest: SkillsManifest) => {
    blockWriteWhileWarming(agentPath);
    return call<SkillsManifest>("put_skills_manifest", () =>
      getEngine().putSkillsManifest(agentPath, manifest),
    );
  },
  setEnabled: (agentPath: string, slug: string, enabled: boolean) => {
    blockWriteWhileWarming(agentPath);
    return call<SkillsManifest>("set_skill_enabled", () =>
      getEngine().setSkillEnabled(agentPath, slug, enabled),
    );
  },
  revertOverride: (agentPath: string, slug: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("revert_skill_override", () =>
      getEngine().revertSkillOverride(agentPath, slug),
    );
  },
  disableForAgent: (agentPath: string, slug: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("disable_skill_for_agent", () =>
      getEngine().disableSkillForAgent(agentPath, slug),
    );
  },
};

export const tauriSkillDrafts = {
  discard: (agentPath: string, activityId: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("discard_skill_draft", () =>
      getEngine().discardSkillDraft(agentPath, activityId),
    );
  },
};

import {
  FilePreviewError,
  type FilePreviewOptions,
} from "@houston/wire-types/file-preview";
import { osOpenFile, osRevealAgent, osRevealFile } from "./os-bridge";

export const tauriFiles = {
  previewPlan: (...args: Parameters<FilesModule["previewPlan"]>) =>
    getEngine().engineSdk.files.previewPlan(...args),
  classifyPreviewRefusal: (
    ...args: Parameters<FilesModule["classifyPreviewRefusal"]>
  ) => getEngine().engineSdk.files.classifyPreviewRefusal(...args),
  list: (agentPath: string) =>
    isAgentPathCreating(agentPath)
      ? Promise.resolve<FileEntry[]>([])
      : passiveAgentRead<FileEntry[]>("list_project_files", async () =>
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
  download: (
    agentPath: string,
    relativePath: string,
    options?: { toast?: boolean } & (
      | FilePreviewOptions
      | { as?: never; lang?: never }
    ),
  ) =>
    call<{ blob: Blob; contentType: string }>(
      "download_project_file",
      () =>
        getEngine().downloadProjectFile(
          agentPath,
          relativePath,
          options?.as === "pdf" ? { as: "pdf", lang: options.lang } : undefined,
        ),
      { agentPath, relativePath },
      {
        ...options,
        silence: (error) =>
          options?.as === "pdf" ||
          isFileGoneError(error) ||
          error instanceof FilePreviewError,
      },
    ).catch(async (err: unknown) => {
      if (options?.toast !== false && isFileGoneError(err)) {
        const { showExpectedStateToast } = await import("./error-toast");
        showExpectedStateToast(
          i18n.t("agents:files.gone.title"),
          i18n.t("agents:files.gone.description"),
        );
      }
      throw err;
    }),
  delete: (agentPath: string, relativePath: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>("delete_file", () =>
      getEngine().deleteFile(agentPath, relativePath),
    );
  },
  rename: (agentPath: string, relativePath: string, newName: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>(
      "rename_file",
      () => getEngine().renameFile(agentPath, relativePath, newName),
      undefined,
      { silence: isNameTakenError },
    );
  },
  createFolder: (agentPath: string, name: string) => {
    blockWriteWhileWarming(agentPath);
    return call<void>(
      "create_agent_folder",
      async () => {
        await getEngine().createFolder(agentPath, name);
      },
      undefined,
      { silence: isNameTakenError },
    );
  },
  upload: (
    agentPath: string,
    files: File[],
    targetDir?: string | null,
    opts?: FileUploadOptions,
  ) => {
    blockWriteWhileWarming(agentPath);
    return call<void>(
      "upload_project_files",
      () => getEngine().uploadProjectFiles(agentPath, files, targetDir, opts),
      { agentPath, targetDir, fileCount: files.length },
      { silence: isUploadTooLargeError },
    );
  },
  move: (agentPath: string, relPath: string, toDir: string | null) => {
    blockWriteWhileWarming(agentPath);
    return call<void>(
      "move_project_file",
      () => getEngine().moveProjectFile(agentPath, relPath, toDir),
      undefined,
      { silence: isNameTakenError },
    );
  },
  downloadArchive: (agentPath: string, relPath?: string) =>
    call<{ blob: Blob; contentType: string }>(
      "download_project_archive",
      () => getEngine().downloadProjectArchive(agentPath, relPath),
      { agentPath, relPath },
    ),
  revealAgent: (agentPath: string) => osRevealAgent(agentPath),
};

import type {
  NewActivity as EngineNewActivity,
  NewRoutine as EngineNewRoutine,
  RoutineUpdate as EngineRoutineUpdate,
} from "@houston/engine-adapter";
import * as activityData from "../data/activity";
import * as configData from "../data/config";
import type { TurnMode } from "./turn-mode";

export const tauriRoutines = {
  list: (agentPath: string) =>
    isAgentPathCreating(agentPath)
      ? Promise.resolve([])
      : passiveAgentRead("list_routines", () =>
          getEngine().listRoutines(agentPath),
        ),
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
  listRuns: (agentPath: string) =>
    isAgentPathCreating(agentPath)
      ? Promise.resolve([])
      : passiveAgentRead("list_routine_runs", () =>
          getEngine().listRoutineRuns(agentPath),
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
  mintWebhookKey: (agentPath: string, routineId: string) =>
    call("mint_routine_webhook_key", () =>
      getEngine().mintRoutineWebhookKey(agentPath, routineId),
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
    mode?: TurnMode,
  ) =>
    activityData.create(
      agentPath,
      title,
      description ?? "",
      agent,
      provider,
      model,
      mode,
    ),
  createWithId: (agentPath: string, input: EngineNewActivity) =>
    call(
      "create_activity",
      () => getEngine().createActivity(agentPath, input),
      undefined,
      { toast: false, silence: isAgentGoneError },
    ),
  createWithIdAttempt: (agentPath: string, input: EngineNewActivity) =>
    call(
      "create_activity",
      () =>
        getEngine().createActivity(agentPath, input, {
          retryWhileWaking: true,
        }),
      undefined,
      { surface: false },
    ),
  update: (
    agentPath: string,
    activityId: string,
    update: activityData.ActivityUpdate,
  ) => activityData.update(agentPath, activityId, update).then(() => undefined),
  setMode: (agentPath: string, activityId: string, mode: TurnMode) =>
    getEngine()
      .updateActivity(agentPath, activityId, { mode })
      .then(() => undefined),
  titleFromClient: (
    agentPath: string,
    activityId: string,
    title: MissionTitle | undefined,
  ) => getEngine().titleMissionFromClient(agentPath, activityId, title),
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

export const tauriConfig = {
  read: (agentPath: string) => configData.read(agentPath),
  write: (
    agentPath: string,
    config: configData.Config,
    opts?: WarmingWriteOptions,
  ) => configData.write(agentPath, config, opts),
};

export const tauriPreferences = {
  getNextStepSuggestions: () =>
    call<boolean>("get_next_step_suggestions", () =>
      getEngine().getNextStepSuggestions(),
    ),
  setNextStepSuggestions: (enabled: boolean) =>
    call<boolean>("set_next_step_suggestions", () =>
      getEngine().setNextStepSuggestions(enabled),
    ),
  resolveWorkspace: (
    workspaces: readonly Workspace[] | Promise<readonly Workspace[]>,
  ) => getEngine().resolveWorkspaceSelection(workspaces),
  rememberWorkspace: (value: string | null) =>
    getEngine().rememberWorkspaceSelection(value),
  get: (key: string) =>
    call<string | null>("get_preference", () => getEngine().getPreference(key)),
  set: (key: string, value: string | null) =>
    call<void>(
      "set_preference",
      () => getEngine().setPreference(key, value),
      undefined,
      key === "last_workspace_id" ? { surface: false } : undefined,
    ),
  seedTimezone: (workspaceId: string, detected: string) =>
    call<TimezoneSeedResult>("seed_timezone", () =>
      getEngine().seedTimezone(workspaceId, detected),
    ),
};

export const tauriSidebar = {
  getLayout: (workspaceId: string) =>
    call<import("@houston/engine-adapter").SidebarLayout>(
      "get_sidebar_layout",
      () => getEngine().getSidebarLayout(workspaceId),
    ),
  setLayout: (
    workspaceId: string,
    layout: import("@houston/engine-adapter").SidebarLayout,
  ) =>
    call<import("@houston/engine-adapter").SidebarLayout>(
      "set_sidebar_layout",
      () => getEngine().setSidebarLayout(workspaceId, layout),
    ),
};

export interface ProviderStatus {
  provider: string;
  cli_installed: boolean;
  auth_state: ProviderAuthState;
  authenticated: boolean;
  cli_name: string;
  active_model?: string;
  credentialScope?: CredentialScope;
  health?: ProviderHealth;
  reconnectBy?: number;
}

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

async function storedDefaultProvider(): Promise<string | null> {
  return toDisplayProviderIdOrNull(
    await getEngine().getPreference(DEFAULT_PROVIDER_PREF_KEY),
  );
}
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
        credentialScope: p.credentialScope,
        health: p.health,
        reconnectBy: p.reconnectBy,
      };
    }),
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
            credentialScope: p.credentialScope,
            health: p.health,
            reconnectBy: p.reconnectBy,
          };
        });
        return out;
      },
    ),
  checkAllStatusesForAgent: (agentId: string, ids: readonly string[]) =>
    call<Record<string, ProviderStatus>>(
      "check_agent_provider_statuses",
      async () => {
        const list = await getEngine().providerStatusesForAgent(agentId, ids);
        const out: Record<string, ProviderStatus> = {};
        ids.forEach((id, index) => {
          const status = list[index];
          if (!status) return;
          out[id] = {
            provider: status.provider,
            cli_installed: status.cliInstalled,
            auth_state: status.authState,
            authenticated: status.authState === "authenticated",
            cli_name: status.cliName,
            active_model: status.activeModel,
            health: status.health,
            reconnectBy: status.reconnectBy,
          };
        });
        return out;
      },
    ),
  getDefault: () =>
    call<string>(
      "get_default_provider",
      async () => (await storedDefaultProvider()) ?? "",
    ),
  getLastUsed: () =>
    call<{ provider: string | null; model: string | null }>(
      "get_last_used_provider",
      async () => {
        const [provider, model] = await Promise.all([
          storedDefaultProvider(),
          getEngine().getPreference(DEFAULT_MODEL_PREF_KEY),
        ]);
        return { provider, model: normalizeLegacyModel(model, provider) };
      },
    ),
  usage: () =>
    call<ProviderUsage[]>(
      "provider_usage",
      () => getEngine().providerUsage(),
      undefined,
      { toast: false, capture: false },
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
    call<void>(
      "launch_provider_login",
      () => {
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
            (provider === "openai" &&
            codexUsesLoopbackRelay(
              (import.meta.env ?? {}) as {
                VITE_NEW_ENGINE_URL?: string;
                VITE_HOSTED_ENGINE_URL?: string;
              },
              { isTauri: osIsTauri() },
            )
              ? false
              : (isRemoteEngine() &&
                  !isLoopbackHostUrl(
                    import.meta.env?.VITE_NEW_ENGINE_URL as string | undefined,
                  ) &&
                  !isLoopbackHostUrl(
                    import.meta.env?.VITE_HOSTED_ENGINE_URL as
                      | string
                      | undefined,
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
      opts?.toast === false ? { toast: false } : undefined,
    ),
  launchLogout: (provider: string) =>
    call<void>("launch_provider_logout", () =>
      getEngine().providerLogout(provider),
    ),
  submitLoginCode: (
    provider: string,
    code: string,
    opts?: Pick<EngineCallOptions, "surface">,
  ) =>
    call<void>(
      "submit_provider_login_code",
      () => getEngine().submitProviderLoginCode(provider, code),
      undefined,
      { silence: isProviderLoginSessionLostError, ...opts },
    ),
  cancelLogin: (provider: string) =>
    call<void>("cancel_provider_login", () => {
      cancelCodexLoopback(provider);
      if (shouldUseClaudeDesktopLogin({ provider, isTauri: osIsTauri() })) {
        cancelClaudeBrowserLogin(provider);
        return Promise.resolve();
      }
      return getEngine().cancelProviderLogin(provider);
    }),
  setApiKey: (provider: string, apiKey: string, endpoint?: string) =>
    call<void>(
      "set_provider_api_key",
      () => getEngine().setProviderApiKey(provider, apiKey, endpoint),
      undefined,
      {
        toast: false,
        silence: (err) =>
          isOrgAdminRequiredError(err) || isApiKeyUserRejection(err),
      },
    ),
  setCustomEndpoint: (
    endpoint: CustomEndpoint,
    surface: CustomEndpointSurface = "toast",
  ) =>
    call<void>(
      "set_provider_custom_endpoint",
      () => getEngine().setProviderCustomEndpoint(endpoint),
      undefined,
      surface === "inline"
        ? { toast: false, silence: isCloudEgressBlockedError }
        : undefined,
    ),
};

export type AssistantHandle = import("@houston/engine-adapter").AssistantHandle;

export const tauriAssistant = {
  discover: (options?: Pick<EngineCallOptions, "surface">) =>
    call<AssistantHandle>(
      "get_assistant",
      () => getEngine().getAssistant(),
      undefined,
      { silence: isAssistantUnavailableError, ...options },
    ),
};

import { openExternalUrl } from "./open-external-url";
export const tauriSystem = {
  openUrl: openExternalUrl,
  chatHistoryMigrated: () =>
    call<boolean>(
      "chat_history_migrated",
      async () => (await getEngine().version()).chatHistoryMigrated ?? false,
      undefined,
      { toast: false, capture: false },
    ),
};

export const tauriIntegrations = {
  status: () =>
    call("integration_status", () => getEngine().integrationStatus()),
  setSession: (token: string | null) =>
    call("integration_session", () => getEngine().setIntegrationSession(token)),
  toolkits: (provider: IntegrationProviderId) =>
    call("integration_toolkits", () =>
      getEngine().integrationToolkits(provider),
    ),
  connections: (provider: IntegrationProviderId) =>
    call("integration_connections", () =>
      getEngine().integrationConnections(provider),
    ),
  connect: (provider: IntegrationProviderId, toolkit: string, agent?: string) =>
    call(
      "integration_connect",
      () => getEngine().connectIntegration(provider, toolkit, agent),
      { provider, toolkit },
      {
        silence: (err) => integrationConnectRefusal(err) !== null,
      },
    ),
  connection: (provider: IntegrationProviderId, connectionId: string) =>
    call(
      "integration_connection",
      () => getEngine().integrationConnection(provider, connectionId),
      { provider, connectionId },
      { silence: isIntegrationConnectionGoneError },
    ),
  disconnect: (
    provider: IntegrationProviderId,
    toolkit: string,
    connectionId?: string,
  ) =>
    call("integration_disconnect", () =>
      getEngine().disconnectIntegration(provider, toolkit, connectionId),
    ),
  dismissReconnectNotice: () =>
    call("integration_dismiss_reconnect_notice", () =>
      getEngine().dismissIntegrationsReconnectNotice(),
    ),
  customList: () => getEngine().customIntegrations(),
  customUpdateDetails: (
    slug: string,
    details: { name: string; website: string },
    agentId?: string,
  ) =>
    call("custom_integration_update_details", () =>
      getEngine().updateCustomIntegrationDetails(slug, details, agentId),
    ),
  customRemove: (slug: string) =>
    call("custom_integration_remove", () =>
      getEngine().removeCustomIntegration(slug),
    ),
  customCredential: (slug: string, values: Record<string, string>) =>
    call("custom_integration_credential", () =>
      getEngine().submitCustomIntegrationCredential(slug, values),
    ),
  customListForAgent: (agentId: string) =>
    getEngine().agentCustomIntegrations(agentId),
  customCredentialForAgent: (
    agentId: string,
    slug: string,
    values: Record<string, string>,
  ) =>
    call("custom_integration_credential", () =>
      getEngine().submitAgentCustomIntegrationCredential(agentId, slug, values),
    ),
  customRemoveForAgent: (agentId: string, slug: string) =>
    call("custom_integration_remove", () =>
      getEngine().removeAgentCustomIntegration(agentId, slug),
    ),
  customDetect: (url: string, agentId?: string) =>
    call("custom_integration_detect", () =>
      agentId
        ? getEngine().detectAgentCustomIntegration(agentId, url)
        : getEngine().detectCustomIntegration(url),
    ),
  customAdd: (input: AddCustomIntegrationInput, agentId?: string) =>
    call("custom_integration_add", () =>
      agentId
        ? getEngine().addAgentCustomIntegration(agentId, input)
        : getEngine().addCustomIntegration(input),
    ),
  customOAuthStart: (
    slug: string,
    agentId?: string,
    options?: Pick<EngineCallOptions, "surface">,
  ) =>
    call(
      "custom_integration_oauth_start",
      () =>
        agentId
          ? getEngine().startAgentCustomIntegrationOAuth(agentId, slug)
          : getEngine().startCustomIntegrationOAuth(slug),
      { integration_slug: slug },
      options,
    ),
};

export const tauriOrg = {
  get: () => call("get_org", () => getEngine().getOrg()),
  profiles: (ids: string[]) =>
    call("get_org_profiles", () => getEngine().getOrgProfiles(ids), undefined, {
      toast: false,
      capture: false,
    }),
  people: () =>
    call("get_org_people", () => getEngine().getOrgPeople(), undefined, {
      toast: false,
      capture: false,
    }),
  quoteSeat: () => call("quote_org_seat", () => getEngine().quoteSeat()),
  addMember: (
    email: string,
    role: import("@houston/engine-adapter").OrgRole,
    options?: EngineCallOptions,
    charge?: { prorationDate: number; quotedAmountCents: number },
  ) =>
    call(
      "add_org_member",
      () =>
        getEngine().addOrgMember(
          email,
          role,
          charge?.prorationDate,
          charge?.quotedAmountCents,
        ),
      undefined,
      options,
    ),
  deleteInvite: (inviteId: string) =>
    call<void>("delete_org_invite", () =>
      getEngine().deleteOrgInvite(inviteId),
    ),
  acceptInvite: (inviteId: string, options?: EngineCallOptions) =>
    call(
      "accept_org_invite",
      () => getEngine().acceptOrgInvite(inviteId),
      undefined,
      options,
    ),
  declineInvite: (inviteId: string, options?: EngineCallOptions) =>
    call<void>(
      "decline_org_invite",
      () => getEngine().declineOrgInvite(inviteId),
      undefined,
      options,
    ),
  removeMember: (userId: string) =>
    call("remove_org_member", () => getEngine().removeOrgMember(userId)),
  memberRoutines: (userId: string) =>
    call(
      "list_member_routines",
      () => getEngine().listMemberRoutines(userId),
      undefined,
      { silence: isExpectedMemberRoutinesRefusal },
    ),
  setMemberRole: (
    userId: string,
    role: import("@houston/engine-adapter").OrgRole,
  ) =>
    call("set_org_member_role", () =>
      getEngine().setOrgMemberRole(userId, role),
    ),
  audit: (opts: { before?: number; limit?: number } = {}) =>
    call("org_audit", () => getEngine().orgAudit(opts)),
  usage: (days: number) => call("org_usage", () => getEngine().orgUsage(days)),
  computeUsage: (days: number) =>
    call("org_compute_usage", () => getEngine().computeUsage(days)),
  listOrgs: () => call("list_orgs", () => getEngine().listOrgs()),
  createOrg: (input: {
    name: string;
    plan?: import("@houston/engine-adapter").OrgPlan;
    interval?: import("@houston/engine-adapter").BillingInterval;
  }) => call("create_org", () => getEngine().createOrg(input)),
  moveAgent: (
    agentSlugOrId: string,
    toSlug: string,
    options?: EngineCallOptions,
  ) =>
    call(
      "move_agent",
      () => getEngine().moveAgent(agentSlugOrId, toSlug),
      undefined,
      options,
    ),
  moveStatus: (
    agentSlugOrId: string,
    moveId: string,
    options?: EngineCallOptions,
  ) =>
    call(
      "agent_move_status",
      () => getEngine().getMoveStatus(agentSlugOrId, moveId),
      undefined,
      options,
    ),
  getBilling: () => call("get_billing", () => getEngine().getBilling()),
  createCheckout: (
    interval: import("@houston/engine-adapter").BillingInterval,
  ) => call("create_checkout", () => getEngine().createCheckout({ interval })),
  switchToYearly: () =>
    call("switch_to_yearly", () => getEngine().switchToYearly()),
  dismissPriceNotice: () =>
    call("dismiss_price_notice", () => getEngine().dismissPriceNotice()),
  createPortal: () => call("create_portal", () => getEngine().createPortal()),
  claimFreeSlot: () =>
    call("claim_free_slot", () => getEngine().claimFreeSlot()),
  getBillingChoice: () =>
    call("get_billing_choice", () => getEngine().getBillingChoice()),
  setBillingChoice: (pick: BillingChoicePick) =>
    call("set_billing_choice", () => getEngine().setBillingChoice(pick)),
  dismissBillingChoiceNotice: () =>
    call("dismiss_billing_choice_notice", () =>
      getEngine().dismissBillingChoiceNotice(),
    ),
  listPlanRoutines: () =>
    call("list_plan_routines", () => getEngine().listPlanRoutines()),
  keepRoutine: (key: import("@houston/engine-adapter").PlanRoutineKey) =>
    call("keep_plan_routine", () => getEngine().keepRoutine(key)),
  resumeRoutines: () =>
    call("resume_plan_routines", () => getEngine().resumeRoutines()),
  reportPresence: () =>
    call("report_presence", () => getEngine().reportPresence(), undefined, {
      toast: false,
    }),
};

export const tauriProfile = {
  get: () =>
    call("get_my_profile", () => getEngine().getMyProfile(), undefined, {
      toast: false,
      capture: false,
    }),
  set: (update: EditableProfileUpdate) =>
    call("set_my_profile", () => getEngine().setMyProfile(update)),
};

export const tauriApiKeys = {
  list: () => call("list_api_keys", () => getEngine().listApiKeys()),
  create: (name: string) =>
    call("create_api_key", () => getEngine().createApiKey(name), undefined, {
      silence: isKeyLimitError,
    }),
  revoke: (id: string) =>
    call<void>(
      "revoke_api_key",
      () => getEngine().revokeApiKey(id),
      undefined,
      {
        silence: isKeyGoneError,
      },
    ).catch((err) => {
      if (isKeyGoneError(err)) return;
      throw err;
    }),
};

const channelCall = <T>(label: ChannelCall, fn: () => Promise<T>) =>
  call<T>(label, fn, undefined, {
    silence: (err) => silenceChannelCall(label, err),
  });

export const tauriChannels = {
  list: (signal?: AbortSignal) =>
    channelCall("list_channels", () => getEngine().getChannels(signal)),
  connectSlack: (
    returnTo: SlackConnectReturn | undefined,
    signal?: AbortSignal,
  ) =>
    channelCall("connect_slack", () =>
      getEngine().connectSlack(returnTo, signal),
    ),
  linkSlack: (signal?: AbortSignal) =>
    channelCall("link_slack", () => getEngine().linkSlack(signal)),
  linkWhatsApp: (signal?: AbortSignal) =>
    channelCall("link_whatsapp", () => getEngine().linkWhatsApp(signal)),
  completeSlack: (ticket: string, signal?: AbortSignal) =>
    channelCall("complete_slack", () =>
      getEngine().completeSlack(ticket, signal),
    ),
  disconnect: (id: string, signal?: AbortSignal) =>
    channelCall<void>("disconnect_channel", () =>
      getEngine().disconnectChannel(id, signal),
    ),
  openSlack: (url: string) =>
    channelCall("open_slack", () => tauriSystem.openUrl(url)),
};

export const tauriPush = {
  deviceId: () =>
    call("push_device_id", () => getEngine().pushDeviceId(), undefined, {
      toast: false,
    }),
  register: (id: string, input: PushDeviceRegistration) =>
    call(
      "push_register",
      () => getEngine().registerPushDevice(id, input),
      undefined,
      { toast: false },
    ),
  unregister: (id: string, signal?: AbortSignal) =>
    call(
      "push_unregister",
      () => getEngine().unregisterPushDevice(id, signal),
      undefined,
      { toast: false },
    ),
  startPresence: (
    foreground: () => boolean,
    onError: (error: unknown) => void,
  ) => getEngine().startPushPresence(foreground, onError),
};
