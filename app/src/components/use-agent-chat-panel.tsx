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
 *   - tool helpers        — file tool renderer
 *
 * The hook also owns the Skill submission pipeline (createMission
 * for new conversations, tauriChat.send for follow-ups) so we don't
 * duplicate the encoding + feed-push logic in two places.
 */

import type { AIBoardProps } from "@houston-ai/board";
import type { ChatMessage, ChatPanelProps, FeedItem } from "@houston-ai/chat";
import {
  decodeAttachmentMessage,
  UserAttachmentMessage,
  type UserAttachmentMessageLabels,
} from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, Play } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useActivity, useSkills } from "../hooks/queries";
import { useFileToolRenderer } from "../hooks/use-file-tool-renderer";
import { useProviderStatuses } from "../hooks/use-provider-statuses";
import { useSession } from "../hooks/use-session";
import { analytics } from "../lib/analytics";
import { attachmentReferences } from "../lib/attachment-message";
import { filterAutoContinueFeedItems } from "../lib/auto-continue-message";
import {
  effectiveContextWindow,
  sessionContextUsage,
} from "../lib/context-usage";
import { createMission } from "../lib/create-mission";
import { humanizeSkillName } from "../lib/humanize-skill-name";
import {
  decideHandoffMode,
  estimateConversationTokens,
  type ProviderHandoffMode,
} from "../lib/provider-switch";
import {
  type EffortLevel,
  getContextWindowConfig,
  getDefaultModel,
  getProvider,
  normalizeLegacyModel,
  validEffortOrDefault,
  validModelOrNull,
} from "../lib/providers";
import { queryKeys } from "../lib/query-keys";
import {
  buildSkillClaudePrompt,
  decodeSkillMessage,
  encodeSkillMessage,
} from "../lib/skill-message";
import {
  tauriActivity,
  tauriAttachments,
  tauriChat,
  tauriConfig,
  tauriProvider,
  withAttachmentPaths,
} from "../lib/tauri";
import type { Agent, AgentDefinition, SkillSummary } from "../lib/types";
import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import { resolveEffectiveProvider } from "./chat-effective-provider";
import { ChatEffortSelector } from "./chat-effort-selector";
import { ChatModelSelector } from "./chat-model-selector";
import { ContextCompactedDivider } from "./context-compacted-divider";
import { ContextIndicator } from "./context-indicator";
import { NewMissionPickerDialog } from "./new-mission-picker-dialog";
import { ProviderSwitchDialog } from "./provider-switch-dialog";
import { SelectedSkillChip } from "./selected-skill-chip";
import { ProviderErrorCard } from "./shell/provider-error-card";
import { ProviderReconnectCard } from "./shell/provider-reconnect-card";
import { ToolRuntimeErrorCard } from "./shell/tool-runtime-error-card";
import { SkillCard } from "./skill-card";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "./tabs/provider-auth-feed";
import { isToolRuntimeErrorMessage } from "./tool-runtime-feed";
import { useChatDisplayLabels } from "./use-chat-display-labels";
import { UserSkillMessage } from "./user-skill-message";

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
  processLabels: ChatPanelProps["processLabels"];
  getThinkingMessage: ChatPanelProps["getThinkingMessage"];
  thinkingIndicator: ChatPanelProps["thinkingIndicator"];
  endOfTurnIndicator: ChatPanelProps["endOfTurnIndicator"];
  renderTurnSummary: ChatPanelProps["renderTurnSummary"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  mapFeedItems: AIBoardProps["mapFeedItems"];
  afterMessages: AIBoardProps["afterMessages"];
  /** Hidden picker dialog mounted in the consumer. */
  pickerDialog: ReactNode;
  /** Effective provider/model for sending. */
  effectiveProvider: string;
  effectiveModel: string;
  /** Multiplayer only (C5): the signed-in viewer's user id, for attributing
   *  teammates' messages. Undefined when signed out / single-player. */
  currentUserId: ChatPanelProps["currentUserId"];
  /** Localized author-attribution labels forwarded to ChatPanel. */
  authorLabels: ChatPanelProps["authorLabels"];
}

export function useAgentChatPanel({
  agent,
  agentDef,
  selectedSessionKey,
  onSelectSession,
}: UseAgentChatPanelArgs): AgentChatPanelProps {
  const { t } = useTranslation(["board", "chat"]);
  const {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    endOfTurnIndicator,
  } = useChatDisplayLabels();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);

  // Multiplayer attribution (C5): the signed-in viewer's id lets ChatPanel tell
  // the viewer's own bubbles from teammates'. Undefined signed out / local.
  const { data: session } = useSession();
  const currentUserId = session?.user.id;
  const authorLabels = undefined;

  const path = agent?.folderPath ?? null;
  const agentModes = agentDef?.config.agents;

  // ── Activity / agent tier model resolution ─────────────────────────────
  // Activity is the per-mission override; agent config is the per-agent
  // default. Workspace-level defaults were retired and pushed into agent
  // configs. Legacy Claude model aliases ("opus"/"sonnet") are normalized to
  // their explicit version IDs on read (mirrors the engine migration) so a
  // stored alias never falls through to the default model and silently
  // downgrades an Opus agent to Sonnet — activity records in particular are
  // never migrated on disk, so this read-side guard is what covers them.
  const [agentProvider, setAgentProvider] = useState<string | null>(null);
  const [agentModel, setAgentModel] = useState<string | null>(null);
  const [agentEffort, setAgentEffort] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setAgentProvider(null);
      setAgentModel(null);
      setAgentEffort(null);
      return;
    }
    tauriConfig
      .read(path)
      .then((cfg) => {
        setAgentProvider((cfg.provider as string) ?? null);
        setAgentModel(normalizeLegacyModel((cfg.model as string) ?? null));
        setAgentEffort((cfg.effort as string) ?? null);
      })
      .catch(() => {});
  }, [path]);

  // Last-used provider preference (`default_provider`, written by setLastUsed
  // on every provider pick). The fallback when neither the activity nor the
  // agent config names a provider, so an OpenAI-only user opening a no-provider
  // agent sees their own provider in the dropdown and forwards it on send,
  // instead of silently defaulting to Claude and failing auth (#483). One-shot
  // load mirrors the agent-config read above; the literal "anthropic" below
  // stays only as the last resort, matching the engine's factory default.
  const [lastUsedProvider, setLastUsedProvider] = useState<string | null>(null);
  useEffect(() => {
    tauriProvider
      .getDefault()
      .then((p) => setLastUsedProvider(p || null))
      .catch(() => {});
  }, []);

  const { data: activities } = useActivity(path ?? undefined);
  const selectedActivity = useMemo(() => {
    if (!selectedSessionKey || !activities) return null;
    return (
      activities.find(
        (a) => (a.session_key ?? `activity-${a.id}`) === selectedSessionKey,
      ) ?? null
    );
  }, [activities, selectedSessionKey]);
  const activityProvider = selectedActivity?.provider ?? null;
  const activityModel = normalizeLegacyModel(selectedActivity?.model ?? null);
  const selectedActivityId = selectedActivity?.id ?? null;

  // Which providers the user is actually logged into (reactive + cached). The
  // fallback below picks an authenticated one rather than a stale preference,
  // so a no-provider agent never lands on a logged-out CLI (#483).
  const { statuses: providerStatuses } = useProviderStatuses();
  const authedProviders = useMemo(
    () =>
      Object.values(providerStatuses)
        .filter((s) => s.authenticated)
        .map((s) => s.provider),
    [providerStatuses],
  );

  // Whether the open conversation already has turns. Once it does, the chat's
  // provider is frozen (see resolveEffectiveProvider): a provider that logs out
  // mid-conversation must surface the reconnect card, never silently hand the
  // turn to another connected provider.
  const hasMessages = useFeedStore((s) =>
    path && selectedSessionKey
      ? (s.items[path]?.[selectedSessionKey]?.length ?? 0) > 0
      : false,
  );

  const effectiveProvider = resolveEffectiveProvider(
    activityProvider,
    agentProvider,
    lastUsedProvider,
    authedProviders,
    hasMessages,
  );
  const effectiveModel =
    validModelOrNull(effectiveProvider, activityModel) ??
    validModelOrNull(effectiveProvider, agentModel) ??
    getDefaultModel(effectiveProvider);
  // Effort is a per-agent setting validated against whatever model is active
  // (activity override or agent default), so it never offers an unsupported
  // level for the model that will actually run.
  const effectiveEffort = validEffortOrDefault(
    effectiveProvider,
    effectiveModel,
    agentEffort,
  );

  // ── Context-usage indicator ───────────────────────────────────────────
  // Latest turn's normalized usage from this session's feed, divided by a
  // self-correcting window estimate: the active model's catalogued default,
  // snapped up once the session's observed peak proves a larger (plan/credit-
  // gated) window. Drives the composer footer pill + dialog.
  const sessionFeedItems = useFeedStore((s) =>
    path && selectedSessionKey
      ? s.items[path]?.[selectedSessionKey]
      : undefined,
  );
  const { contextUsage, contextWindow } = useMemo(() => {
    const { latest, peakContextTokens } = sessionContextUsage(sessionFeedItems);
    // `peakContextTokens` is session-wide while `cfg` is the currently-selected
    // model's. Providers CAN now differ across one conversation (the picker is
    // unlocked, so a conversation can move to a new provider mid-session), so a
    // peak observed under the old provider may snap the new model's window up
    // until a `provider_switched` divider resets it. That only ever OVER-states
    // the window (it can never read above 100% — `effectiveContextWindow`
    // floors at the peak), and the figure is already labeled an estimate, so
    // it's acceptable for the post-switch turns until the new provider reports
    // its own usage and the indicator re-settles.
    const cfg = getContextWindowConfig(effectiveProvider, effectiveModel);
    return {
      contextUsage: latest,
      contextWindow:
        effectiveContextWindow(cfg, peakContextTokens) ?? undefined,
    };
  }, [sessionFeedItems, effectiveProvider, effectiveModel]);

  // A provider switch awaiting the user's consent (it spends tokens). Held here
  // and applied only on confirm.
  const [switchDialog, setSwitchDialog] = useState<{
    toProvider: string;
    toModel: string;
    mode: ProviderHandoffMode;
  } | null>(null);

  // Whether this conversation has produced provider output already, so a switch
  // crosses a LIVE conversation (vs. just setting the default before the first
  // turn). Consent is only needed once output exists.
  const conversationStarted = useMemo(
    () =>
      (sessionFeedItems ?? []).some(
        (i) =>
          i.feed_type === "final_result" ||
          i.feed_type === "assistant_text" ||
          i.feed_type === "assistant_text_streaming",
      ),
    [sessionFeedItems],
  );

  // Persist a provider/model choice (agent config, the per-mission activity
  // override, and the last-used preference) with an optimistic picker flip.
  // Shared by the plain pick and the post-consent switch path.
  const applyProviderModel = useCallback(
    async (prov: string, mod: string) => {
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

  // Picking a provider/model from the dropdown. Switching to a DIFFERENT provider
  // mid-conversation brings the whole conversation over to it (the runtime
  // re-points its session, carrying or summarizing prior context), which spends
  // tokens — so ask first via the consent dialog. The size only decides which
  // copy the dialog shows; the runtime makes the real replay/summarize call. A
  // model change within the same provider, or any pick before the first turn,
  // just persists.
  const handleModelSelect = useCallback(
    async (prov: string, mod: string) => {
      const isProviderSwitch =
        conversationStarted &&
        !!selectedSessionKey &&
        prov !== effectiveProvider;
      if (!isProviderSwitch) {
        await applyProviderModel(prov, mod);
        return;
      }
      const mode = decideHandoffMode({
        currentContextTokens: contextUsage?.context_tokens ?? null,
        estimatedTokens: estimateConversationTokens(sessionFeedItems),
        // The new provider hasn't been observed yet, so use its catalogued
        // DEFAULT window, not a snapped-up estimate.
        targetWindowTokens: getContextWindowConfig(prov, mod)?.default ?? null,
      });
      setSwitchDialog({ toProvider: prov, toModel: mod, mode });
    },
    [
      conversationStarted,
      selectedSessionKey,
      effectiveProvider,
      contextUsage,
      sessionFeedItems,
      applyProviderModel,
    ],
  );

  // The user confirmed the switch dialog: persist the new provider/model. The
  // runtime applies the actual handoff (and emits the divider) on the next send.
  const confirmProviderSwitch = useCallback(async () => {
    const pending = switchDialog;
    setSwitchDialog(null);
    if (!pending) return;
    await applyProviderModel(pending.toProvider, pending.toModel);
  }, [switchDialog, applyProviderModel]);
  const handleEffortSelect = useCallback(
    async (effort: EffortLevel) => {
      // Effort is per-agent (not per-activity): persist to the agent config
      // the engine reads at send time. Optimistic flip for the picker.
      setAgentEffort(effort);
      try {
        if (path) {
          const cfg = await tauriConfig.read(path);
          await tauriConfig.write(path, { ...cfg, effort });
        }
      } catch (err) {
        addToast({
          title: t("chat:errors.modelPersistFailed"),
          description: String(err),
          variant: "error",
        });
      }
    },
    [path, addToast, t],
  );

  // ── File-tool rendering (per-agent path) ──────────────────────────────
  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(path ?? "");

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
  // Controlled open for the footer model dropdown, so an error card's "Pick
  // another model" CTA pops the SAME picker (the Skills picker above is separate).
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [activeSkill, setActiveSkill] = useState<SkillSummary | null>(null);
  // Drop selected Skill when the agent / session changes so it doesn't
  // leak across contexts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: path and selectedSessionKey are intentional change-triggers that reset activeSkill when the agent or session switches; they are reactive values derived from props and must remain in the dep list.
  useEffect(() => {
    setActiveSkill(null);
  }, [path, selectedSessionKey]);

  const onSelectSessionRef = useRef(onSelectSession);
  useEffect(() => {
    onSelectSessionRef.current = onSelectSession;
  }, [onSelectSession]);

  const attachmentLabels = useMemo<UserAttachmentMessageLabels>(
    () => ({
      attachmentCount: (count) => t("attachmentMessage.count", { count }),
    }),
    [t],
  );

  // While a Skill is selected, the regular composer still owns text
  // and attachments. This hook only wraps the submitted message with the
  // hidden Skill marker + deterministic "Use the X skill" prompt.
  const handleSkillComposerSubmit = useCallback<
    NonNullable<AIBoardProps["onComposerSubmit"]>
  >(
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
          effortOverride: effectiveEffort,
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
            promptFile: mode?.promptFile,
            // See note above re: effectiveProvider over chatProvider.
            providerOverride: effectiveProvider,
            modelOverride: effectiveModel,
            effortOverride: effectiveEffort,
            buildPrompt: async (activityId) => {
              const paths = await tauriAttachments.save(
                `activity-${activityId}`,
                files,
              );
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
      analytics.track("skill_used", { skill_slug: skill.name });
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
      effectiveEffort,
      pushFeedItem,
      queryClient,
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
      if (msg.compaction)
        return <ContextCompactedDivider info={msg.compaction} />;
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
                effortOverride: effectiveEffort,
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
      // Typed provider-error card (rate-limit, quota, model-unavailable,
      // UNAUTHENTICATED reconnect button, internal 5xx, …). The engine emits
      // these as `provider_error` FeedItems; feed-to-messages stashes the
      // payload on `msg.providerError` with empty `content`. Without this
      // branch the message fell through to the default renderer below, which
      // shows `msg.content` ("") — i.e. NOTHING. That's why a 429 card and the
      // OpenAI reconnect card never appeared in chat.
      if (msg.providerError) {
        return (
          <ProviderErrorCard
            error={msg.providerError}
            onRetry={async () => {
              if (!path || !selectedSessionKey) return;
              const text = t("chat:toolRuntimeError.retryPrompt");
              await tauriChat.send(path, text, selectedSessionKey, {
                providerOverride: effectiveProvider,
                modelOverride: effectiveModel,
                effortOverride: effectiveEffort,
              });
              pushFeedItem(path, selectedSessionKey, {
                feed_type: "user_message",
                data: text,
              });
            }}
            // "Pick another model" pops the MODEL picker (not the Skills picker);
            // "Switch to <fallback>" applies it directly on the same provider.
            onSwitchModel={() => setModelPickerOpen(true)}
            onApplyModel={(model) =>
              handleModelSelect(effectiveProvider, model)
            }
          />
        );
      }
      if (isProviderAuthMessage(msg.content)) return null;
      return undefined;
    },
    [
      effectiveModel,
      effectiveProvider,
      effectiveEffort,
      handleModelSelect,
      path,
      pushFeedItem,
      selectedSessionKey,
      t,
    ],
  );
  const mapFeedItems = useCallback(
    ({ items }: { sessionKey: string; items: FeedItem[] }) =>
      filterAutoContinueFeedItems(filterProviderAuthFeedItems(items)),
    [],
  );
  const afterMessages = useCallback(
    ({ feedItems }: { sessionKey: string; feedItems: FeedItem[] }) => {
      // The persisted inline `UnauthenticatedCard` (a provider_error feed item)
      // is the stable reconnect surface. When it's already present for THIS
      // chat's provider, don't also render the store-driven card — it flickers
      // (auto-dismisses) when the provider's auth probe is unreliable, e.g.
      // codex reporting "authenticated" off a stale ~/.codex/auth.json after a
      // server-side session kill. One card, and it stays put.
      const hasInlineAuthCard = feedItems.some(
        (it) =>
          it.feed_type === "provider_error" &&
          it.data.kind === "unauthenticated" &&
          it.data.provider === effectiveProvider,
      );
      if (hasInlineAuthCard) return null;
      const signalKey = providerAuthSignalKey(feedItems);
      // Always hand the card THIS chat's provider so it can match the global
      // `authRequired` flag against the provider this chat actually uses — a
      // Claude logout must never surface a reconnect button in an OpenAI chat
      // (HOU-410). The card stays hidden unless that provider truly needs auth.
      return (
        <ProviderReconnectCard
          providerId={effectiveProvider}
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
    return () => (
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
          open={modelPickerOpen}
          onOpenChange={setModelPickerOpen}
        />
        <ChatEffortSelector
          provider={effectiveProvider}
          model={effectiveModel}
          effort={effectiveEffort}
          onSelect={handleEffortSelect}
        />
        <div className="ml-auto">
          <ContextIndicator
            usage={contextUsage}
            contextWindow={contextWindow}
          />
        </div>
      </div>
    );
  }, [
    agent,
    t,
    effectiveProvider,
    effectiveModel,
    effectiveEffort,
    handleModelSelect,
    handleEffortSelect,
    contextUsage,
    contextWindow,
    modelPickerOpen,
  ]);

  const attachMenu = useMemo<AIBoardProps["attachMenu"]>(() => {
    if (!agent) return undefined;
    return ({ openFilePicker, close }) => (
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
          />
        </div>
        <div className="px-2 py-1">
          <ChatEffortSelector
            provider={effectiveProvider}
            model={effectiveModel}
            effort={effectiveEffort}
            onSelect={handleEffortSelect}
          />
        </div>
      </div>
    );
  }, [
    agent,
    t,
    effectiveProvider,
    effectiveModel,
    effectiveEffort,
    handleModelSelect,
    handleEffortSelect,
  ]);

  const pickerDialog = agent ? (
    <>
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
      <ProviderSwitchDialog
        open={switchDialog !== null}
        providerId={switchDialog?.toProvider ?? ""}
        providerName={
          switchDialog
            ? (getProvider(switchDialog.toProvider)?.name ??
              switchDialog.toProvider)
            : ""
        }
        mode={switchDialog?.mode ?? "replay"}
        onConfirm={confirmProviderSwitch}
        onCancel={() => setSwitchDialog(null)}
      />
    </>
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
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    endOfTurnIndicator,
    renderTurnSummary,
    renderSystemMessage,
    mapFeedItems,
    afterMessages,
    pickerDialog,
    effectiveProvider,
    effectiveModel,
    currentUserId,
    authorLabels,
  };
}
