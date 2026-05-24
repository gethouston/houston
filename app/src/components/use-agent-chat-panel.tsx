/**
 * Per-agent chat panel hook.
 *
 * Centralises every agent-scoped concern that gets spread into AIBoard
 * so the per-agent BoardTab and the cross-agent Mission Control share
 * one implementation. Callers pass an `agent` (the conversation's
 * scope) and the hook returns ready-to-use AIBoard props:
 *
 *   - chatEmptyState      — featured-skill cards + "see more"
 *   - composerHeader      — selected Skill chip above the prompt input
 *   - footer              — model selector + "Skills" button
 *   - renderUserMessage   — decode + render skill-invocation card
 *   - tool / link helpers — file tool renderer, Composio link card
 *
 * The hook also owns the Skill submission pipeline (createMission
 * for new conversations, tauriChat.send for follow-ups) so we don't
 * duplicate the encoding + feed-push logic in two places.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@houston-ai/core";
import { Paperclip, Play } from "lucide-react";
import {
  decodeAttachmentMessage,
  UserAttachmentMessage,
  type UserAttachmentMessageLabels,
} from "@houston-ai/chat";

import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import {
  useActivity,
  useConnectedToolkits,
  useConnections,
  useSkills,
} from "../hooks/queries";
import {
  tauriActivity,
  tauriAttachments,
  tauriChat,
  tauriConfig,
  tauriProvider,
  tauriShell,
  tauriWorktree,
  withAttachmentPaths,
} from "../lib/tauri";
import { createMission } from "../lib/create-mission";
import { queryKeys } from "../lib/query-keys";
import { humanizeSkillName } from "../lib/humanize-skill-name";
import { useFileToolRenderer } from "../hooks/use-file-tool-renderer";
import { useAskUserQuestionRenderer } from "../hooks/use-ask-user-question-renderer";
import { useComposedSpecialToolRenderers } from "../hooks/use-composed-special-tool-renderers";
import {
  ComposioLinkCard,
  parseComposioToolkitFromHref,
} from "./composio-link-card";
import {
  ComposioSigninCard,
  isComposioSigninHref,
} from "./composio-signin-card";
import { ChatModelSelector } from "./chat-model-selector";
import { ContextMeter } from "./context-meter";
import { FeatureGate } from "./FeatureGate";
import { getDefaultModel, validModelOrNull } from "../lib/providers";
import { analytics } from "../lib/analytics";
import {
  buildSkillClaudePrompt,
  decodeSkillMessage,
  encodeSkillMessage,
} from "../lib/skill-message";
import { attachmentReferences } from "../lib/attachment-message";
import { SkillCard } from "./skill-card";
import { NewMissionPickerDialog } from "./new-mission-picker-dialog";
import { UserSkillMessage } from "./user-skill-message";
import { SelectedSkillChip } from "./selected-skill-chip";
import { ProviderReconnectCard } from "./shell/provider-reconnect-card";
import { ToolRuntimeErrorCard } from "./shell/tool-runtime-error-card";
import { isToolRuntimeErrorMessage } from "./tool-runtime-feed";
import { useChatDisplayLabels } from "./use-chat-display-labels";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "./tabs/provider-auth-feed";

import type { AIBoardProps } from "@houston-ai/board";
import type { ChatMessage, ChatPanelProps, FeedItem } from "@houston-ai/chat";
import type { Agent, AgentDefinition, SkillSummary } from "../lib/types";

interface UseAgentChatPanelArgs {
  /** The agent the panel is currently scoped to. Null disables features. */
  agent: Agent | null;
  /** That agent's catalog definition (for agentModes etc.). */
  agentDef: AgentDefinition | null;
  /** Currently-open session key, if any. Drives Skill routing. */
  selectedSessionKey: string | null;
  /** Called with the new conversation id after a Skill's "Start". */
  onSelectSession?: (id: string) => void;
}

interface AgentChatPanelProps {
  /** Renders skill cards + "see more" when no Skill is in flight. */
  chatEmptyState: AIBoardProps["chatEmptyState"];
  /** Selected Skill chip rendered above the prompt input. */
  composerHeader: AIBoardProps["composerHeader"];
  /** Submit can run the selected Skill without extra text. */
  canSendEmpty: AIBoardProps["canSendEmpty"];
  /** Intercepts composer submit while a Skill is selected. */
  onComposerSubmit: AIBoardProps["onComposerSubmit"];
  /** Composer footer with model selector + Skills button. */
  footer: AIBoardProps["footer"];
  /** Paperclip popover content with Add files / Skills / Model. */
  attachMenu: AIBoardProps["attachMenu"];
  /** Decodes skill-invocation user messages into a card. */
  renderUserMessage: AIBoardProps["renderUserMessage"];
  /** Forwarded to AIBoard / ChatPanel for tool rendering. */
  isSpecialTool: ChatPanelProps["isSpecialTool"];
  renderToolResult: ChatPanelProps["renderToolResult"];
  renderPendingTool: ChatPanelProps["renderPendingTool"];
  processLabels: ChatPanelProps["processLabels"];
  getThinkingMessage: ChatPanelProps["getThinkingMessage"];
  renderTurnSummary: ChatPanelProps["renderTurnSummary"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  mapFeedItems: AIBoardProps["mapFeedItems"];
  afterMessages: AIBoardProps["afterMessages"];
  /** Custom Composio inline-link rendering. */
  renderLink: AIBoardProps["renderLink"];
  /** Hidden picker dialog mounted in the consumer. */
  pickerDialog: ReactNode;
  /** Effective provider/model for sending. */
  effectiveProvider: string;
  effectiveModel: string;
}

export function useAgentChatPanel({
  agent,
  agentDef,
  selectedSessionKey,
  onSelectSession,
}: UseAgentChatPanelArgs): AgentChatPanelProps {
  const { t } = useTranslation(["board", "chat"]);
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const path = agent?.folderPath ?? null;
  const agentModes = agentDef?.config.agents;

  // ── Activity / agent tier model resolution ─────────────────────────────
  // Activity is the per-mission override; agent config is the per-agent
  // default. Workspace-level defaults were retired; existing values were
  // migrated into agent configs at engine boot.
  const [agentProvider, setAgentProvider] = useState<string | null>(null);
  const [agentModel, setAgentModel] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setAgentProvider(null);
      setAgentModel(null);
      return;
    }
    tauriConfig
      .read(path)
      .then((cfg) => {
        setAgentProvider((cfg.provider as string) ?? null);
        setAgentModel((cfg.model as string) ?? null);
      })
      .catch(() => {});
  }, [path]);

  const { data: activities } = useActivity(path ?? undefined);
  const selectedActivity = useMemo(() => {
    if (!selectedSessionKey || !activities) return null;
    return activities.find(
      (a) => (a.session_key ?? `activity-${a.id}`) === selectedSessionKey,
    ) ?? null;
  }, [activities, selectedSessionKey]);
  const activityProvider = selectedActivity?.provider ?? null;
  const activityModel = selectedActivity?.model ?? null;
  const selectedActivityId = selectedActivity?.id ?? null;

  const effectiveProvider = activityProvider ?? agentProvider ?? "anthropic";
  const effectiveModel =
    validModelOrNull(effectiveProvider, activityModel) ??
    validModelOrNull(effectiveProvider, agentModel) ??
    getDefaultModel(effectiveProvider);
  const handleModelSelect = useCallback(
    async (prov: string, mod: string) => {
      // Optimistic UI: the picker flips instantly while the writes fan out.
      setAgentProvider(prov);
      setAgentModel(mod);
      try {
        if (path) {
          const cfg = await tauriConfig.read(path);
          await tauriConfig.write(path, {
            ...cfg,
            provider: prov as "anthropic" | "openai",
            model: mod,
          });
        }
        if (path && selectedActivityId) {
          await tauriActivity.update(path, selectedActivityId, {
            provider: prov,
            model: mod,
          });
        }
        await tauriProvider.setLastUsed(prov, mod);
      } catch (err) {
        addToast({
          title: t("chat:errors.modelPersistFailed"),
          description: String(err),
          variant: "error",
        });
      }
    },
    [path, selectedActivityId, addToast, t],
  );

  // ── Composio link card support ────────────────────────────────────────
  const { data: composioStatus } = useConnections();
  const isSignedIn = composioStatus?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );
  const renderLink = useCallback(
    ({ href, onOpen }: { href: string; onOpen: () => void }) => {
      if (isComposioSigninHref(href)) {
        return <ComposioSigninCard />;
      }
      const toolkit = parseComposioToolkitFromHref(href);
      if (!toolkit) return undefined;
      return (
        <ComposioLinkCard
          toolkit={toolkit}
          isConnected={connectedSet.has(toolkit)}
          onOpen={onOpen}
        />
      );
    },
    [connectedSet],
  );

  // ── File-tool rendering (per-agent path) ──────────────────────────────
  const fileRenderer = useFileToolRenderer(path ?? "");
  const { renderTurnSummary } = fileRenderer;
  // ── AskUserQuestion interactive card ──────────────────────────────────
  // `selectedSessionKey` is null when the panel renders the empty state;
  // an empty string is fine because the card only POSTs after the user
  // clicks Submit, which only happens once a tool_call has arrived (and
  // by then the session has a real key).
  const askUserRenderer = useAskUserQuestionRenderer(
    path ?? "",
    selectedSessionKey ?? "",
  );
  const composedSpecialRenderers = useMemo(
    () => [fileRenderer, askUserRenderer],
    [fileRenderer, askUserRenderer],
  );
  const { isSpecialTool, renderToolResult, renderPendingTool } =
    useComposedSpecialToolRenderers(composedSpecialRenderers);

  // ── Skills + selected-skill state ─────────────────────────────────────
  const { data: allSkills } = useSkills(path ?? undefined);
  const emptySkillShowcase = useMemo(() => {
    const skills = allSkills ?? [];
    const featured = skills.filter((s) => s.featured);
    return (featured.length > 0 ? featured : skills).slice(0, 3);
  }, [allSkills]);
  const moreSkillsCount = Math.max(
    0,
    (allSkills?.length ?? 0) - emptySkillShowcase.length,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSkill, setActiveSkill] = useState<SkillSummary | null>(null);
  // Drop selected Skill when the agent / session changes so it doesn't
  // leak across contexts.
  useEffect(() => {
    setActiveSkill(null);
  }, [path, selectedSessionKey]);

  const onSelectSessionRef = useRef(onSelectSession);
  useEffect(() => {
    onSelectSessionRef.current = onSelectSession;
  }, [onSelectSession]);

  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const attachmentLabels = useMemo<UserAttachmentMessageLabels>(
    () => ({
      attachmentCount: (count) => t("attachmentMessage.count", { count }),
    }),
    [t],
  );

  // While a Skill is selected, the regular composer still owns text
  // and attachments. This hook only wraps the submitted message with the
  // hidden Skill marker + deterministic "Use the X skill" prompt.
  const handleSkillComposerSubmit = useCallback<NonNullable<AIBoardProps["onComposerSubmit"]>>(
    async ({ sessionKey, text, files }) => {
      const skill = activeSkill;
      if (!skill || !agent || !path) return false;

      const claudePrompt = buildSkillClaudePrompt(skill, text);
      const encoded = encodeSkillMessage(skill, text, claudePrompt);
      const friendlyTitle = humanizeSkillName(skill.name);

      if (sessionKey) {
        // Mid-conversation: optimistic feed push + send, mirrors the
        // text-send pipeline.
        const scopeId = sessionKey;
        const attachmentPaths = await tauriAttachments.save(scopeId, files);
        const prompt = withAttachmentPaths(claudePrompt, attachmentPaths);
        const encodedWithAttachments = encodeSkillMessage(
          skill,
          text,
          prompt,
          attachmentReferences(files, attachmentPaths),
        );
        const mode = agentModes?.find((m) => m.id === undefined); // default mode
        await tauriChat.send(path, encodedWithAttachments, sessionKey, {
          mode: mode?.promptFile,
          // Pass the EFFECTIVE values, not just `chatProvider`. The dropdown
          // displays `effectiveProvider` (chatProvider ?? activityProvider ??
          // agentProvider ?? wsProvider), so the send must mirror it.
          // Passing only `chatProvider` lets the engine fall back to its own
          // resolution chain (which doesn't consult activity records),
          // producing the "dropdown says Gemini, response from Claude" bug.
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
        });
        pushFeedItem(path, sessionKey, {
          feed_type: "user_message",
          data: encodedWithAttachments,
        });
      } else {
        // New conversation: createMission with `title` override so the
        // kanban card reads "Research a company" instead of the marker.
        const agentMode = agentModes?.[0]?.id;
        const mode = agentModes?.find((m) => m.id === agentMode);
        let encodedUserMessage = encoded;

        // Honour worktree mode if the agent's config opts in. Same
        // bootstrap as BoardTab's text-send path.
        let worktreePath: string | undefined;
        try {
          const cfg = await tauriConfig.read(path);
          if (cfg.worktreeMode) {
            const slug = crypto.randomUUID().slice(0, 8);
            const wt = await tauriWorktree.create(path, slug);
            worktreePath = wt.path;
            const installCmd = cfg.installCommand as string | undefined;
            if (installCmd && worktreePath) {
              tauriShell.run(worktreePath, installCmd).catch(console.error);
            }
          }
        } catch {
          /* config may not exist yet */
        }

        const { conversationId, sessionKey } = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: path,
          },
          encoded,
          {
            agentMode,
            worktreePath,
            promptFile: mode?.promptFile,
            // See note above re: effectiveProvider over chatProvider.
            providerOverride: effectiveProvider,
            modelOverride: effectiveModel,
            buildPrompt: async (activityId) => {
              const paths = await tauriAttachments.save(`activity-${activityId}`, files);
              const prompt = withAttachmentPaths(claudePrompt, paths);
              encodedUserMessage = encodeSkillMessage(
                skill,
                text,
                prompt,
                attachmentReferences(files, paths),
              );
              return encodedUserMessage;
            },
            title: friendlyTitle,
          },
        );
        pushFeedItem(path, sessionKey, {
          feed_type: "user_message",
          data: encodedUserMessage,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        analytics.track("mission_created", {
          agent_mode: agentMode ?? "default",
        });
        onSelectSessionRef.current?.(conversationId);
      }
      setActiveSkill(null);
      return true;
    },
    [
      activeSkill,
      agent,
      path,
      agentModes,
      effectiveProvider,
      effectiveModel,
      pushFeedItem,
      queryClient,
      t,
    ],
  );

  // Picking a skill from a card or the picker pins it above the regular
  // composer. The user can add text or send the Skill by itself.
  const applySkill = useCallback(
    (skill: SkillSummary) => setActiveSkill(skill),
    [],
  );

  // ── Built JSX bundles ─────────────────────────────────────────────────
  const renderUserMessage = useCallback(
    (msg: { content: string }) => {
      const invocation = decodeSkillMessage(msg.content);
      if (invocation) {
        return (
          <UserSkillMessage
            invocation={invocation}
            attachmentLabels={attachmentLabels}
          />
        );
      }
      const attachmentInvocation = decodeAttachmentMessage(msg.content);
      if (!attachmentInvocation) return undefined;
      return (
        <UserAttachmentMessage
          invocation={attachmentInvocation}
          labels={attachmentLabels}
        />
      );
    },
    [attachmentLabels],
  );
  const renderSystemMessage = useCallback(
    (msg: ChatMessage) => {
      if (isToolRuntimeErrorMessage(msg)) {
        const isModelUnsupported =
          msg.runtimeError.kind === "provider_model_unsupported";
        return (
          <ToolRuntimeErrorCard
            error={msg.runtimeError}
            onRetry={async () => {
              if (!path || !selectedSessionKey) return;
              const text = t("chat:toolRuntimeError.retryPrompt");
              await tauriChat.send(path, text, selectedSessionKey, {
                // Retry mirrors the displayed dropdown values, not just
                // the in-memory chatProvider — see send sites above.
                providerOverride: effectiveProvider,
                modelOverride: effectiveModel,
              });
              pushFeedItem(path, selectedSessionKey, {
                feed_type: "user_message",
                data: text,
              });
            }}
            onSwitchModel={
              isModelUnsupported
                ? () => handleModelSelect("openai", "gpt-5.5")
                : undefined
            }
          />
        );
      }
      if (isProviderAuthMessage(msg.content)) return null;
      return undefined;
    },
    [effectiveModel, effectiveProvider, handleModelSelect, path, pushFeedItem, selectedSessionKey, t],
  );
  const mapFeedItems = useCallback(
    ({ items }: { sessionKey: string; items: FeedItem[] }) =>
      filterProviderAuthFeedItems(items),
    [],
  );
  const afterMessages = useCallback(
    ({ feedItems }: { sessionKey: string; feedItems: FeedItem[] }) => {
      const signalKey = providerAuthSignalKey(feedItems);
      return (
        <ProviderReconnectCard
          providerId={signalKey ? effectiveProvider : undefined}
          signalKey={signalKey ?? undefined}
        />
      );
    },
    [effectiveProvider],
  );

  const composerHeader = useMemo<AIBoardProps["composerHeader"]>(() => {
    if (!agent || !activeSkill) return undefined;
    return (
      <SelectedSkillChip
        skill={activeSkill}
        onCancel={() => setActiveSkill(null)}
      />
    );
  }, [agent, activeSkill]);

  const chatEmptyState = useMemo<AIBoardProps["chatEmptyState"]>(() => {
    if (!agent) return undefined;
    if (activeSkill) return null;
    if (emptySkillShowcase.length === 0) return undefined;
    return (
      <div className="self-stretch w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-6 pt-6 pb-4 flex flex-col gap-3">
          <div className="text-center mb-1">
            <h3 className="text-base font-semibold text-foreground">
              {t("chatEmpty.heading")}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("chatEmpty.subheading")}
            </p>
          </div>
          {emptySkillShowcase.map((s) => (
            <SkillCard
              key={s.name}
              image={s.image}
              title={humanizeSkillName(s.name)}
              description={s.description}
              integrations={s.integrations}
              onClick={() => applySkill(s)}
            />
          ))}
          {moreSkillsCount > 0 && (
            <Button
              size="sm"
              className="self-center mt-1 rounded-full gap-1.5"
              onClick={() => setPickerOpen(true)}
            >
              <Play className="size-3 fill-current" />
              {t("chatEmpty.seeMore", { count: moreSkillsCount })}
            </Button>
          )}
        </div>
      </div>
    );
  }, [agent, activeSkill, emptySkillShowcase, moreSkillsCount, t, applySkill]);

  const footer = useMemo<AIBoardProps["footer"]>(() => {
    if (!agent) return undefined;
    return ({ hasMessages, feedItems }) => (
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-keep-panel-open
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Play className="size-3 fill-current" />
          {t("composerSkill.browse")}
        </button>
        <ChatModelSelector
          provider={effectiveProvider}
          model={effectiveModel}
          onSelect={handleModelSelect}
          lockedProvider={hasMessages ? effectiveProvider : null}
        />
        <FeatureGate flag="advanced.context_meter">
          <ContextMeter
            feedItems={feedItems}
            provider={effectiveProvider}
            model={effectiveModel}
          />
        </FeatureGate>
      </div>
    );
  }, [agent, t, effectiveProvider, effectiveModel, handleModelSelect]);

  const attachMenu = useMemo<AIBoardProps["attachMenu"]>(() => {
    if (!agent) return undefined;
    return ({ hasMessages, openFilePicker, close }) => (
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            openFilePicker();
          }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors"
        >
          <Paperclip className="size-4 text-muted-foreground" />
          {t("composerAttach.addFiles")}
        </button>
        <button
          type="button"
          onClick={() => {
            setPickerOpen(true);
            close();
          }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors"
        >
          <Play className="size-4 text-muted-foreground fill-current" />
          {t("composerSkill.browse")}
        </button>
        <div className="px-2 py-1">
          <ChatModelSelector
            provider={effectiveProvider}
            model={effectiveModel}
            onSelect={handleModelSelect}
            lockedProvider={hasMessages ? effectiveProvider : null}
          />
        </div>
      </div>
    );
  }, [agent, t, effectiveProvider, effectiveModel, handleModelSelect]);

  const pickerDialog = agent ? (
    <NewMissionPickerDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      lockedAgent={agent}
      hideBlank
      onSkill={(_agentPath, skillName) => {
        const skill = (allSkills ?? []).find((s) => s.name === skillName);
        if (skill) applySkill(skill);
      }}
    />
  ) : null;

  return {
    chatEmptyState,
    composerHeader,
    canSendEmpty: activeSkill != null,
    onComposerSubmit: handleSkillComposerSubmit,
    footer,
    attachMenu,
    renderUserMessage,
    isSpecialTool,
    renderToolResult,
    renderPendingTool,
    processLabels,
    getThinkingMessage,
    renderTurnSummary,
    renderSystemMessage,
    mapFeedItems,
    afterMessages,
    renderLink,
    pickerDialog,
    effectiveProvider,
    effectiveModel,
  };
}
