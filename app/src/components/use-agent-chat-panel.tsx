import { hasOnlySuggestionSteps } from "@houston/protocol/interaction";
import { setupGreetingCopy } from "@houston/sdk/first-day";
import type { AIBoardProps } from "@houston-ai/board";
import type { ChatMessage, ChatPanelProps, FeedItem } from "@houston-ai/chat";
import {
  ChatMissionList,
  type ChatMissionListItem,
  type ChatMissionListLabels,
  ChatParentMissionLink,
  type ChatParentMissionLinkLabels,
  ChatPlanReadyCard,
  type ChatPlanReadyLabels,
  ChatSuggestActions,
  type ChatSuggestActionsLabels,
  ChatSuggestReusableCard,
  type ChatSuggestReusableLabels,
  decodeAttachmentMessage,
  decodeCitedMessage,
  decodeInteractionAnswersMessage,
  UserAttachmentMessage,
  type UserAttachmentMessageLabels,
  UserInteractionAnswersMessage,
} from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { FolderUp, Paperclip, Play } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type * as configData from "../data/config";
import {
  useActivity,
  useAgentConfig,
  useAgentModelChoice,
  useChatHistory,
  useSetAgentModelChoice,
  useSkills,
} from "../hooks/queries";
import { useApprovalCardCopy } from "../hooks/use-approval-card-copy";
import { useCapabilities } from "../hooks/use-capabilities";
import { useConnectAiComposer } from "../hooks/use-connect-ai-composer";
import { useConnectProviderName } from "../hooks/use-connect-providers";
import {
  useConversationFeed,
  useConversationVm,
} from "../hooks/use-conversation-vm";
import { useFileToolRenderer } from "../hooks/use-file-tool-renderer";
import { useOpenAgentHref } from "../hooks/use-open-agent-file";
import { useProviderStatuses } from "../hooks/use-provider-statuses";
import { useSendPin } from "../hooks/use-send-pin";
import { useSession } from "../hooks/use-session";
import { useSetupHello } from "../hooks/use-setup-hello";
import { useStoreSkillLocaleMigration } from "../hooks/use-store-skill-locale-migration";
import { useWelcomeGreetingRevealed } from "../hooks/use-welcome-greeting";
import { deriveActiveInteraction } from "../lib/active-interaction";
import { isWelcomeSessionKey } from "../lib/agent-welcome";
import { analytics } from "../lib/analytics";
import { attachmentReferences } from "../lib/attachment-message";
import {
  encodeAutoContinueMessage,
  filterAutoContinueFeedItems,
} from "../lib/auto-continue-message";
import { isModelAllowed } from "../lib/ceiling-match";
import { agentTierFromConfig } from "../lib/chat-agent-tier";
import { coherentPinModel, resolveChatModelPin } from "../lib/chat-model-pin";
import { shouldShowConnectAiEmptyState } from "../lib/composer-connect-ai";
import {
  effectiveContextWindow,
  sessionContextUsage,
} from "../lib/context-usage";
import { createMission } from "../lib/create-mission";
import { resolveDictationLangHint } from "../lib/dictation/types";
import { useDictation } from "../lib/dictation/use-dictation";
import {
  genericErrorDescription,
  logAndReportError,
} from "../lib/error-report";
import { showExpectedStateToast } from "../lib/error-toast";
import { skillDisplayTitle } from "../lib/humanize-skill-name";
import { providerForModel, providerOffersModel } from "../lib/model-labels";
import { isModelNotAllowedError } from "../lib/model-not-allowed";
import {
  type ModelPin,
  modelSelectorDecision,
  resolvePersonalModelPin,
} from "../lib/model-selector-lock";
import { osIsTauri } from "../lib/os-bridge";
import { resolvePlanReadyOverride } from "../lib/plan-ready";
import {
  providerConnectionState,
  providerIsConnected,
} from "../lib/provider-connection";
import {
  toCanonicalProviderId,
  toDisplayProviderIdOrNull,
} from "../lib/provider-overrides";
import {
  decideHandoffMode,
  estimateConversationTokens,
  type ProviderHandoffMode,
} from "../lib/provider-switch";
import {
  catalogRunsAs,
  type EffortLevel,
  getContextWindowConfig,
  normalizeLegacyModel,
  validEffortOrDefault,
} from "../lib/providers";
import { blocksPurchaseUrl } from "../lib/purchase-policy";
import { queryKeys } from "../lib/query-keys";
import { reportRejection } from "../lib/report-rejection";
import {
  type PinInputFailures,
  type SendPinSignals,
  sendPinSettled,
} from "../lib/send-pin-gate";
import { reportSendPinStall } from "../lib/send-pin-stall-report";
import {
  buildSkillClaudePrompt,
  decodeSkillMessage,
  encodeSkillMessage,
} from "../lib/skill-message";
import { resolveSuggestActionsOverride } from "../lib/suggest-actions";
import {
  resolveSuggestReusableOverride,
  type SuggestReusableStep,
} from "../lib/suggest-reusable";
import {
  tauriActivity,
  tauriAttachments,
  tauriChat,
  tauriConfig,
  tauriProvider,
  withAttachmentPaths,
} from "../lib/tauri";
import type { TurnMode } from "../lib/turn-mode";
import type { Agent, SkillSummary } from "../lib/types";
import {
  isAgentProvisioning,
  useAgentProvisioningStore,
} from "../stores/agent-provisioning";
import { useDraftStore, useNewConversationDraftKey } from "../stores/drafts";
import { useInteractionDraftStore } from "../stores/interaction-drafts";
import { useUIStore } from "../stores/ui";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "./agent/provider-auth-feed";
import { useBrowserHandoffCards } from "./browser/use-browser-handoff-cards";
import { resolveEffectiveProvider } from "./chat-effective-provider";
import { ChatEffortSelector } from "./chat-effort-selector";
import { chatInteractionStepsNode } from "./chat-interaction-stepper";
import { ChatModeSelector } from "./chat-mode-selector";
import { ChatModelSelector } from "./chat-model-selector";
import { NOTICE_COPY } from "./chat-notice-copy";
import { ContextCompactedDivider } from "./context-compacted-divider";
import { ContextIndicator } from "./context-indicator";
import { DictationSetupDialog } from "./dictation-setup-dialog";
import { submitWithCitations } from "./file-preview/cited-submit";
import { CitedUserMessage } from "./file-preview/cited-user-message";
import { useCitationComposer } from "./file-preview/use-citation-composer";
import { FilesNotSavedNote } from "./files-not-saved-note";
import { IntegrationConnectCard } from "./integration-connect-card";
import { parseToolkitFromHref } from "./integration-connect-card-state";
import { integrationsSupported } from "./integrations/model";
import { NewMissionPickerDialog } from "./new-mission-picker-dialog";
import { ProviderSwitchDialog } from "./provider-switch-dialog";
import { SelectedSkillChip } from "./selected-skill-chip";
import { usePlanComposerState } from "./shell/plan-composer-state";
import { ProviderErrorCard } from "./shell/provider-error-card";
import {
  continuesTaskAfterReconnect,
  errorCardProvider,
  isInlineAuthCard,
  providerErrorRetryText,
  reconnectContinueText,
  resendsOriginalPrompt,
  resolveProviderErrorForChat,
} from "./shell/provider-error-cards/not-connected";
import { ProviderReconnectCard } from "./shell/provider-reconnect-card";
import { SkillCard } from "./skill-card";
import { skillIntegrationChips } from "./skill-integration-chips";
import { SystemNote } from "./system-note";
import { useChatDisplayLabels } from "./use-chat-display-labels";
import { type ChatMentionProps, useChatMentions } from "./use-chat-mentions";
import { useChatSenderAvatars } from "./use-chat-sender-avatars";
import { useConversationTurnMode } from "./use-conversation-turn-mode";
import { usePersistedInteraction } from "./use-persisted-interaction";
import { useSendInteractionMessage } from "./use-send-interaction-message";
import { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";
import { UserSkillMessage } from "./user-skill-message";

interface UseAgentChatPanelArgs {
  integrationAccountScope?: boolean;
  agent: Agent | null;
  selectedSessionKey: string | null;
  onSelectSession?: (id: string) => void;
  draftScope?: string;
  initialTurnMode?: TurnMode;
  onSendReactivated?: () => void;
  childMissions?: ChatMissionListItem[];
  parentMission?: { id: string; title: string } | null;
  onOpenChildMission?: (id: string) => void;
}

const EMPTY_CHILD_MISSIONS: ChatMissionListItem[] = [];

interface AgentChatPanelProps {
  chatEmptyState: AIBoardProps["chatEmptyState"];
  composerHeader: AIBoardProps["composerHeader"];
  composerOverride: AIBoardProps["composerOverride"];
  composerOverrideMode: AIBoardProps["composerOverrideMode"];
  offersComposerOverride: AIBoardProps["composerOverride"];
  canSendEmpty: AIBoardProps["canSendEmpty"];
  onComposerSubmit: AIBoardProps["onComposerSubmit"];
  footer: AIBoardProps["footer"];
  attachMenu: AIBoardProps["attachMenu"];
  renderUserMessage: AIBoardProps["renderUserMessage"];
  onEditMessage: AIBoardProps["onEditMessage"];
  canEditMessage: AIBoardProps["canEditMessage"];
  editMessageLabel: AIBoardProps["editMessageLabel"];
  messageEditing: AIBoardProps["messageEditing"];
  enableMessageCopy: AIBoardProps["enableMessageCopy"];
  canCopyMessage: AIBoardProps["canCopyMessage"];
  copyMessageLabel: AIBoardProps["copyMessageLabel"];
  renderLink: AIBoardProps["renderLink"];
  openHref: (href: string) => void;
  isSpecialTool: ChatPanelProps["isSpecialTool"];
  renderToolResult: ChatPanelProps["renderToolResult"];
  processLabels: ChatPanelProps["processLabels"];
  getThinkingMessage: ChatPanelProps["getThinkingMessage"];
  thinkingIndicator: ChatPanelProps["thinkingIndicator"];
  renderTurnSummary: ChatPanelProps["renderTurnSummary"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  conversationMap: AIBoardProps["conversationMap"];
  mapFeedItems: AIBoardProps["mapFeedItems"];
  afterMessages: AIBoardProps["afterMessages"];
  pickerDialog: ReactNode;
  effectiveProvider: string;
  effectiveModel: string;
  effectiveEffort: string | undefined;
  resolveSendPin: () => Promise<ModelPin>;
  turnMode: TurnMode;
  currentUserId: ChatPanelProps["currentUserId"];
  authorLabels: ChatPanelProps["authorLabels"];
  showSenders: ChatPanelProps["showSenders"];
  agentLabel: ChatPanelProps["agentLabel"];
  renderSenderAvatar: ChatPanelProps["renderSenderAvatar"];
  senderNameClass: ChatPanelProps["senderNameClass"];
  mentionProps: ChatMentionProps;
  dictation: ChatPanelProps["dictation"];
}

export function useAgentChatPanel({
  agent,
  integrationAccountScope = false,
  selectedSessionKey,
  onSelectSession,
  draftScope,
  initialTurnMode,
  onSendReactivated,
  childMissions = EMPTY_CHILD_MISSIONS,
  parentMission,
  onOpenChildMission,
}: UseAgentChatPanelArgs): AgentChatPanelProps {
  const { t, i18n } = useTranslation(["board", "chat", "dashboard", "teams"]);
  const approvalCopy = useApprovalCardCopy();
  const {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    busyIndicator,
  } = useChatDisplayLabels(agent?.id);
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const { data: session } = useSession();
  const currentUserId = session?.uid;
  const authorLabels = useMemo(() => ({ you: t("chat:attribution.you") }), [t]);

  const conversationMap = useMemo<
    NonNullable<AIBoardProps["conversationMap"]>
  >(() => {
    const baseProps = (conversationLength: number) => {
      if (!agent || !selectedSessionKey) return undefined;
      return {
        agent_id: agent.id,
        conversation_id: selectedSessionKey,
        conversation_length: conversationLength,
        surface: osIsTauri() ? "desktop" : "web",
      };
    };
    return {
      labels: {
        title: t("chat:conversationMap.title"),
        moreActions: t("chat:conversationMap.moreActions"),
        find: t("chat:conversationMap.find"),
        moveToDone: t("board:cardActions.approveTooltip"),
        delete: t("board:cardActions.deleteTooltip"),
        hide: t("chat:conversationMap.hide"),
        searchPlaceholder: t("chat:conversationMap.searchPlaceholder"),
        clearSearch: t("chat:conversationMap.clearSearch"),
        noResults: t("chat:conversationMap.noResults"),
        backToLatest: t("chat:conversationMap.backToLatest"),
        selected: t("chat:conversationMap.selected"),
        messagePosition: (position: number) =>
          t("chat:conversationMap.messagePosition", { position }),
        types: {
          user: t("chat:conversationMap.types.user"),
          assistant: t("chat:conversationMap.types.assistant"),
          artifact: t("chat:conversationMap.types.artifact"),
          error: t("chat:conversationMap.types.error"),
        },
      },
      onOpenChange: (open, conversationLength) => {
        const props = baseProps(conversationLength);
        if (!props) return;
        analytics.track(
          open ? "conversation_map_opened" : "conversation_map_closed",
          props,
        );
      },
      onMomentClick: (moment, conversationLength) => {
        const props = baseProps(conversationLength);
        if (!props) return;
        analytics.track("conversation_map_moment_clicked", {
          ...props,
          moment_type: moment.type,
          message_position: moment.position,
        });
      },
      onBackToLatest: (conversationLength) => {
        const props = baseProps(conversationLength);
        if (!props) return;
        analytics.track("conversation_map_back_to_latest_clicked", props);
      },
    };
  }, [agent, selectedSessionKey, t]);

  const newConversationKey = useNewConversationDraftKey(draftScope);
  const draftKey = selectedSessionKey ?? newConversationKey;
  const citationComposer = useCitationComposer(
    agent?.folderPath ?? null,
    draftKey,
  );
  const openHref = useOpenAgentHref(
    agent?.folderPath ?? null,
    selectedSessionKey,
  );
  const handleDictationTranscript = useCallback(
    (text: string) => {
      const current = useDraftStore.getState().drafts[draftKey]?.text ?? "";
      const needsSpace = current.length > 0 && !current.endsWith(" ");
      useDraftStore
        .getState()
        .setDraftText(draftKey, `${current}${needsSpace ? " " : ""}${text}`);
    },
    [draftKey],
  );
  const { dictation, modelSetup } = useDictation({
    onTranscript: handleDictationTranscript,
    langHint: resolveDictationLangHint(i18n.resolvedLanguage),
    enabled: osIsTauri(),
  });

  const {
    capabilities,
    isLoading: capabilitiesLoading,
    failureReason: capabilitiesFailure,
  } = useCapabilities();
  const integrationsEnabled = integrationsSupported(capabilities);

  const modelDecision = modelSelectorDecision(capabilities, agent);
  const {
    data: modelChoiceInfo,
    isFetched: modelChoiceFetched,
    failureReason: modelChoiceFailure,
  } = useAgentModelChoice(agent?.id ?? "", modelDecision.personal);
  const setModelChoice = useSetAgentModelChoice(agent?.id ?? "");
  const allowedModels = modelDecision.personal
    ? (modelChoiceInfo?.allowedModels ?? null)
    : null;

  const path = agent?.folderPath ?? null;

  const agentId = agent?.id ?? null;
  useEffect(() => {
    if (!agentId || !path) return;
    useAgentProvisioningStore
      .getState()
      .detectSleepingEngine({ id: agentId, folderPath: path });
  }, [agentId, path]);

  const agentConfigQuery = useAgentConfig(path ?? undefined);
  const agentConfigSettled = !path || agentConfigQuery.isFetched;
  const {
    provider: agentProvider,
    model: agentModel,
    effort: agentEffort,
  } = useMemo(
    () => agentTierFromConfig(agentConfigQuery.data),
    [agentConfigQuery.data],
  );
  const setAgentTier = useCallback(
    (patch: Pick<configData.Config, "provider" | "model" | "effort">) => {
      if (!path) return;
      queryClient.setQueryData<configData.Config>(
        queryKeys.config(path),
        (prev) => ({ ...(prev ?? {}), ...patch }),
      );
    },
    [path, queryClient],
  );
  const [lastUsedProvider, setLastUsedProvider] = useState<string | null>(null);
  useEffect(() => {
    reportRejection(
      tauriProvider.getDefault().then((p) => setLastUsedProvider(p || null)),
      "chat.read-default-provider",
      logAndReportError,
    );
  }, []);

  const activityQuery = useActivity(path ?? undefined);
  const activities = activityQuery.data;
  const activitySettled =
    !selectedSessionKey ||
    (activityQuery.isFetched && !activityQuery.isPlaceholderData);
  const selectedActivity = useMemo(() => {
    if (!selectedSessionKey || !activities) return null;
    return (
      activities.find(
        (a) => (a.session_key ?? `activity-${a.id}`) === selectedSessionKey,
      ) ?? null
    );
  }, [activities, selectedSessionKey]);
  const selectedActivityId = selectedActivity?.id ?? null;

  const [pickedPin, setPickedPin] = useState<{
    activityId: string;
    provider: string;
    model: string;
  } | null>(null);
  useEffect(() => {
    if (!pickedPin) return;
    if (
      selectedActivity?.id === pickedPin.activityId &&
      toDisplayProviderIdOrNull(selectedActivity.provider) ===
        pickedPin.provider &&
      selectedActivity.model === pickedPin.model
    )
      setPickedPin(null);
  }, [selectedActivity, pickedPin]);

  const pinForSelected =
    pickedPin && pickedPin.activityId === selectedActivityId ? pickedPin : null;
  const activityProvider = toDisplayProviderIdOrNull(
    pinForSelected?.provider ?? selectedActivity?.provider,
  );
  const activityModel = normalizeLegacyModel(
    pinForSelected?.model ?? selectedActivity?.model ?? null,
    pinForSelected?.provider ?? selectedActivity?.provider,
  );

  const {
    statuses: providerStatuses,
    isLoading: providerStatusesLoading,
    isError: providerStatusesError,
    failureReason: providerStatusesFailure,
  } = useProviderStatuses();
  const authedProviders = useMemo(
    () =>
      Object.values(providerStatuses)
        .filter((s) => providerIsConnected(s))
        .map((s) => s.provider),
    [providerStatuses],
  );
  const unconfirmedProviders = useMemo(
    () =>
      Object.values(providerStatuses)
        .filter((s) => providerConnectionState(s, false) === "checking")
        .map((s) => s.provider),
    [providerStatuses],
  );

  const connectAiComposer = useConnectAiComposer({
    statuses: providerStatuses,
    isLoading: providerStatusesLoading,
    isError: providerStatusesError,
  });

  useChatHistory(
    selectedSessionKey && path ? path : undefined,
    selectedSessionKey ?? undefined,
  );
  const sessionFeedItems = useConversationFeed(path, selectedSessionKey);

  const { showSenders, agentLabel, renderSenderAvatar, senderNameClass } =
    useChatSenderAvatars(agent, sessionFeedItems);

  const mentionProps = useChatMentions();

  const conversationVm = useConversationVm(path, selectedSessionKey);
  const turnRunning = conversationVm?.running ?? false;
  const { turnMode, selectTurnMode: handleModeSelect } =
    useConversationTurnMode({
      path,
      sessionKey: selectedSessionKey,
      card: selectedActivity,
      initialTurnMode,
      turnRunning,
    });

  const hasMessages = sessionFeedItems.length > 0;

  const effectiveProvider = resolveEffectiveProvider(
    activityProvider,
    agentProvider,
    lastUsedProvider,
    authedProviders,
    hasMessages,
    unconfirmedProviders,
  );
  const effectiveModel = resolveChatModelPin(
    effectiveProvider,
    { provider: activityProvider, model: activityModel },
    { provider: agentProvider, model: agentModel },
  ).model;
  const effectiveEffort = validEffortOrDefault(
    effectiveProvider,
    effectiveModel,
    agentEffort,
  );

  const ceilingResolver = useMemo(
    () => ({
      offers: providerOffersModel,
      providerFor: providerForModel,
      runsAs: catalogRunsAs,
      connected: authedProviders,
    }),
    [authedProviders],
  );
  const personalDefaultPin = useMemo(
    () =>
      resolvePersonalModelPin(
        modelChoiceInfo?.choice,
        allowedModels,
        {
          provider: effectiveProvider,
          model: effectiveModel,
          effort: effectiveEffort,
        },
        null,
        ceilingResolver,
      ),
    [
      modelChoiceInfo?.choice,
      allowedModels,
      effectiveProvider,
      effectiveModel,
      effectiveEffort,
      ceilingResolver,
    ],
  );

  const rawDisplayModelPin = useMemo(
    () =>
      modelDecision.personal
        ? resolvePersonalModelPin(
            modelChoiceInfo?.choice,
            allowedModels,
            {
              provider: effectiveProvider,
              model: effectiveModel,
              effort: effectiveEffort,
            },
            activityProvider && activityModel
              ? {
                  provider: activityProvider,
                  model: activityModel,
                }
              : null,
            ceilingResolver,
          )
        : {
            provider: effectiveProvider,
            model: effectiveModel,
            effort: effectiveEffort,
          },
    [
      modelDecision.personal,
      modelChoiceInfo?.choice,
      allowedModels,
      activityProvider,
      activityModel,
      effectiveProvider,
      effectiveModel,
      effectiveEffort,
      ceilingResolver,
    ],
  );
  const displayModelPin = useMemo(() => {
    const model = coherentPinModel(
      rawDisplayModelPin.provider,
      rawDisplayModelPin.model,
    );
    return {
      ...rawDisplayModelPin,
      model,
      effort: validEffortOrDefault(
        rawDisplayModelPin.provider,
        model,
        rawDisplayModelPin.effort,
      ),
    };
  }, [rawDisplayModelPin]);

  const pinSignals: SendPinSignals = {
    agentConfigSettled,
    activitySettled,
    capabilitiesSettled: !capabilitiesLoading,
    choiceSettled: !modelDecision.personal || modelChoiceFetched,
    statusesSettled: !providerStatusesLoading,
  };
  const pinSettled = sendPinSettled(pinSignals);
  const pinFailures: PinInputFailures = {
    agentConfigSettled: agentConfigQuery.failureReason,
    activitySettled: activityQuery.failureReason,
    capabilitiesSettled: capabilitiesFailure,
    choiceSettled: modelChoiceFailure,
    statusesSettled: providerStatusesFailure,
  };
  const pinStallRef = useRef({
    signals: pinSignals,
    agentId,
    failures: pinFailures,
  });
  pinStallRef.current = { signals: pinSignals, agentId, failures: pinFailures };
  const reportPinTimeout = useCallback(() => {
    const { signals, agentId: stalledAgent, failures } = pinStallRef.current;
    reportSendPinStall(
      signals,
      {
        online: typeof navigator === "undefined" || navigator.onLine !== false,
        engineWarming: stalledAgent ? isAgentProvisioning(stalledAgent) : false,
        failures,
      },
      stalledAgent,
    );
  }, []);
  const resolveSendPin = useSendPin(
    displayModelPin,
    pinSettled,
    reportPinTimeout,
  );

  const stampedActivityIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!path || !selectedActivity || selectedActivity.provider) return;
    if (!hasMessages) return;
    if (!pinSettled || activityQuery.isPlaceholderData) return;
    if (stampedActivityIds.current.has(selectedActivity.id)) return;
    stampedActivityIds.current.add(selectedActivity.id);
    reportRejection(
      tauriActivity.update(path, selectedActivity.id, {
        provider: effectiveProvider,
        model: effectiveModel,
      }),
      "chat.pin-conversation-model",
      logAndReportError,
    );
  }, [
    path,
    selectedActivity,
    hasMessages,
    effectiveProvider,
    effectiveModel,
    pinSettled,
    activityQuery.isPlaceholderData,
  ]);

  const { contextUsage, contextWindow } = useMemo(() => {
    const { latest, peakContextTokens } = sessionContextUsage(sessionFeedItems);
    const cfg = getContextWindowConfig(
      displayModelPin.provider,
      displayModelPin.model,
    );
    return {
      contextUsage: latest,
      contextWindow:
        effectiveContextWindow(cfg, peakContextTokens) ?? undefined,
    };
  }, [sessionFeedItems, displayModelPin]);

  const [switchDialog, setSwitchDialog] = useState<{
    toProvider: string;
    toModel: string;
    mode: ProviderHandoffMode;
  } | null>(null);

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

  const applyProviderModel = useCallback(
    async (prov: string, mod: string) => {
      try {
        if (path && selectedActivityId) {
          setPickedPin({
            activityId: selectedActivityId,
            provider: prov,
            model: mod,
          });
          await tauriActivity.update(path, selectedActivityId, {
            provider: toCanonicalProviderId(prov),
            model: mod,
          });
        } else if (modelDecision.personal) {
          await setModelChoice.mutateAsync({
            provider: prov,
            model: mod,
            effort: validEffortOrDefault(prov, mod, displayModelPin.effort),
          });
        } else {
          setAgentTier({ provider: toCanonicalProviderId(prov), model: mod });
          if (path) {
            const cfg = await tauriConfig.read(path);
            await tauriConfig.write(path, {
              ...cfg,
              provider: toCanonicalProviderId(prov),
              model: mod,
            });
          }
        }
        await tauriProvider.setLastUsed(prov, mod);
      } catch (err) {
        if (isModelNotAllowedError(err)) return;
        addToast({
          title: t("chat:errors.modelPersistFailed"),
          description: genericErrorDescription("model_persist_failed", err),
          variant: "error",
        });
      }
    },
    [
      path,
      selectedActivityId,
      setAgentTier,
      modelDecision.personal,
      setModelChoice,
      displayModelPin.effort,
      addToast,
      t,
    ],
  );

  const handleModelSelect = useCallback(
    async (prov: string, mod: string) => {
      const isProviderSwitch =
        conversationStarted &&
        !!selectedSessionKey &&
        prov !== displayModelPin.provider;
      if (!isProviderSwitch) {
        await applyProviderModel(prov, mod);
        return;
      }
      const mode = decideHandoffMode({
        currentContextTokens: contextUsage?.context_tokens ?? null,
        estimatedTokens: estimateConversationTokens(sessionFeedItems),
        targetWindowTokens: getContextWindowConfig(prov, mod)?.default ?? null,
      });
      setSwitchDialog({ toProvider: prov, toModel: mod, mode });
    },
    [
      conversationStarted,
      selectedSessionKey,
      displayModelPin.provider,
      contextUsage,
      sessionFeedItems,
      applyProviderModel,
    ],
  );

  const confirmProviderSwitch = useCallback(async () => {
    const pending = switchDialog;
    setSwitchDialog(null);
    if (!pending) return;
    await applyProviderModel(pending.toProvider, pending.toModel);
  }, [switchDialog, applyProviderModel]);
  const handleEffortSelect = useCallback(
    async (effort: EffortLevel) => {
      setAgentTier({ effort });
      try {
        if (path) {
          const cfg = await tauriConfig.read(path);
          await tauriConfig.write(path, { ...cfg, effort });
        }
      } catch (err) {
        addToast({
          title: t("chat:errors.modelPersistFailed"),
          description: genericErrorDescription("model_persist_failed", err),
          variant: "error",
        });
      }
    },
    [path, addToast, t, setAgentTier],
  );
  const selectModel = useCallback(
    (prov: string, mod: string) => {
      if (
        modelDecision.personal &&
        !isModelAllowed(allowedModels, prov, mod, catalogRunsAs)
      ) {
        showExpectedStateToast(
          t("chat:errors.modelNotAllowed"),
          t("chat:errors.modelNotAllowedBody"),
        );
        return;
      }
      if (modelDecision.personal && !selectedActivityId) {
        setModelChoice.mutate({
          provider: prov,
          model: mod,
          effort: validEffortOrDefault(prov, mod, displayModelPin.effort),
        });
        reportRejection(
          tauriProvider.setLastUsed(prov, mod),
          "chat.save-last-model",
          logAndReportError,
        );
        return;
      }
      void handleModelSelect(prov, mod);
    },
    [
      modelDecision.personal,
      allowedModels,
      t,
      selectedActivityId,
      setModelChoice,
      displayModelPin.effort,
      handleModelSelect,
    ],
  );
  const selectEffort = useCallback(
    (effort: EffortLevel) => {
      if (modelDecision.personal) {
        if (
          !isModelAllowed(
            allowedModels,
            personalDefaultPin.provider,
            personalDefaultPin.model,
            catalogRunsAs,
          )
        ) {
          showExpectedStateToast(
            t("chat:errors.modelNotAllowed"),
            t("chat:errors.modelNotAllowedBody"),
          );
          return;
        }
        setModelChoice.mutate({
          provider: personalDefaultPin.provider,
          model: personalDefaultPin.model,
          effort,
        });
        return;
      }
      void handleEffortSelect(effort);
    },
    [
      modelDecision.personal,
      allowedModels,
      t,
      setModelChoice,
      personalDefaultPin.provider,
      personalDefaultPin.model,
      handleEffortSelect,
    ],
  );

  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(path ?? "", selectedSessionKey);

  const { data: allSkills } = useSkills(path ?? undefined);
  useStoreSkillLocaleMigration(agent);
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
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [activeSkill, setActiveSkill] = useState<SkillSummary | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: path and selectedSessionKey are intentional change-triggers that reset activeSkill when the agent or session switches; they are reactive values derived from props and must remain in the dep list.
  useEffect(() => {
    setActiveSkill(null);
  }, [path, selectedSessionKey]);

  const [editingTurn, setEditingTurn] = useState<{
    sessionKey: string;
    turnId: string;
    key: string;
  } | null>(null);
  useEffect(() => {
    if (editingTurn && editingTurn.sessionKey !== selectedSessionKey)
      setEditingTurn(null);
  }, [editingTurn, selectedSessionKey]);
  const cancelEditMessage = useCallback(() => setEditingTurn(null), []);
  const onEditMessage = useCallback(
    (msg: ChatMessage) => {
      if (!selectedSessionKey || !msg.turnId) return;
      setEditingTurn({
        sessionKey: selectedSessionKey,
        turnId: msg.turnId,
        key: msg.key,
      });
    },
    [selectedSessionKey],
  );
  const onEditMessageSubmit = useCallback(
    async (_msg: ChatMessage, text: string) => {
      if (!editingTurn || !path) return;
      await tauriChat.truncate(
        path,
        editingTurn.sessionKey,
        editingTurn.turnId,
      );
      setEditingTurn(null);
      const pin = await resolveSendPin();
      await tauriChat.send(path, text, editingTurn.sessionKey, {
        providerOverride: pin.provider,
        modelOverride: pin.model,
        effortOverride: pin.effort,
        modeOverride: turnMode,
      });
      onSendReactivatedRef.current?.();
    },
    [editingTurn, path, resolveSendPin, turnMode],
  );
  const messageEditing = useMemo<AIBoardProps["messageEditing"]>(
    () =>
      editingTurn
        ? {
            editingKey: editingTurn.key,
            onSubmit: onEditMessageSubmit,
            onCancel: cancelEditMessage,
            labels: {
              send: t("chat:editMessage.send"),
              cancel: t("chat:editMessage.cancel"),
              editor: t("chat:editMessage.edit"),
            },
          }
        : undefined,
    [editingTurn, onEditMessageSubmit, cancelEditMessage, t],
  );
  const canEditMessage = useCallback(
    (msg: ChatMessage) => {
      if (msg.source) return false;
      if (hasCitations(msg.content)) return false;
      if (decodeSkillMessage(msg.content)) return false;
      if (decodeAttachmentMessage(msg.content)) return false;
      if (decodeInteractionAnswersMessage(msg.content)) return false;
      if (msg.author && msg.author.userId !== currentUserId) return false;
      return true;
    },
    [currentUserId],
  );
  const canCopyMessage = useCallback((msg: ChatMessage) => {
    if (hasCitations(msg.content)) return false;
    if (decodeSkillMessage(msg.content)) return false;
    if (decodeAttachmentMessage(msg.content)) return false;
    if (decodeInteractionAnswersMessage(msg.content)) return false;
    return true;
  }, []);

  const onSendReactivatedRef = useRef(onSendReactivated);
  useEffect(() => {
    onSendReactivatedRef.current = onSendReactivated;
  }, [onSendReactivated]);

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

  const handleSkillComposerSubmit = useCallback<
    NonNullable<AIBoardProps["onComposerSubmit"]>
  >(
    async ({ sessionKey, text, files, mentions }) => {
      const skill = activeSkill;
      if (!skill || !agent || !path) return false;

      const claudePrompt = buildSkillClaudePrompt(skill, text);
      const encoded = encodeSkillMessage(skill, text, claudePrompt);
      const friendlyTitle = skillDisplayTitle(skill);
      const pin = await resolveSendPin();

      if (sessionKey) {
        const scopeId = sessionKey;
        const attachmentPaths = await tauriAttachments.save(
          path,
          scopeId,
          files,
        );
        const prompt = withAttachmentPaths(claudePrompt, attachmentPaths);
        const encodedWithAttachments = encodeSkillMessage(
          skill,
          text,
          prompt,
          attachmentReferences(files, attachmentPaths),
        );
        await tauriChat.send(path, encodedWithAttachments, sessionKey, {
          providerOverride: pin.provider,
          modelOverride: pin.model,
          effortOverride: pin.effort,
          modeOverride: turnMode,
          mentions,
        });
        onSendReactivatedRef.current?.();
      } else {
        const { conversationId } = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: path,
          },
          encoded,
          {
            providerOverride: pin.provider,
            modelOverride: pin.model,
            effortOverride: pin.effort,
            modeOverride: turnMode,
            mentions,
            buildPrompt: async (activityId) => {
              const paths = await tauriAttachments.save(
                path,
                `activity-${activityId}`,
                files,
              );
              const prompt = withAttachmentPaths(claudePrompt, paths);
              return encodeSkillMessage(
                skill,
                text,
                prompt,
                attachmentReferences(files, paths),
              );
            },
            title: friendlyTitle,
            optimistic: true,
          },
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        analytics.track("mission_created");
        onSelectSessionRef.current?.(conversationId);
      }
      analytics.track("skill_used", { skill_slug: skill.name });
      setActiveSkill(null);
      return true;
    },
    [activeSkill, agent, path, resolveSendPin, turnMode, queryClient],
  );

  const applySkill = useCallback(
    (skill: SkillSummary) => setActiveSkill(skill),
    [],
  );

  const handleIntegrationConnected = useCallback(
    (_toolkit: string, appName: string) => {
      if (!path || !selectedSessionKey) return;
      const message = encodeAutoContinueMessage(
        t("chat:composio.connectedFollowup", { name: appName }),
      );
      resolveSendPin()
        .then((pin) =>
          tauriChat.send(path, message, selectedSessionKey, {
            providerOverride: pin.provider,
            modelOverride: pin.model,
            effortOverride: pin.effort,
            modeOverride: turnMode,
          }),
        )
        .then(
          () => onSendReactivatedRef.current?.(),
          (err: unknown) => {
            addToast({
              title: t("chat:composio.followupFailed", { name: appName }),
              description: genericErrorDescription("integration_followup", err),
              variant: "error",
            });
          },
        );
    },
    [path, selectedSessionKey, resolveSendPin, turnMode, addToast, t],
  );
  const renderLink = useCallback<NonNullable<AIBoardProps["renderLink"]>>(
    ({ href, children }) => {
      if (blocksPurchaseUrl(href)) return <span>{children}</span>;
      if (!integrationsEnabled || !agent) return undefined;
      const toolkit = parseToolkitFromHref(href);
      if (!toolkit) return undefined;
      return (
        <IntegrationConnectCard
          toolkit={toolkit}
          accountScope={integrationAccountScope}
          agentId={agent.id}
          onConnected={handleIntegrationConnected}
        />
      );
    },
    [
      integrationsEnabled,
      integrationAccountScope,
      agent,
      handleIntegrationConnected,
    ],
  );

  const activeInteraction = useMemo(
    () =>
      deriveActiveInteraction({
        running: turnRunning,
        live: conversationVm?.pendingInteraction,
        persisted: selectedActivity?.pending_interaction,
        missionStatus: selectedActivity?.status,
      }),
    [
      turnRunning,
      conversationVm?.pendingInteraction,
      selectedActivity?.pending_interaction,
      selectedActivity?.status,
    ],
  );

  const interactionKey =
    activeInteraction?.steps.map((s) => s.id).join(",") ?? null;

  const sendInteractionMessage = useSendInteractionMessage({
    agentId: agent?.id ?? "",
    path,
    sessionKey: selectedSessionKey,
    turnMode,
    resolveSendPin,
    onSendReactivatedRef,
  });

  const resolveBrand = useToolkitBrandResolver();

  const resolveProviderName = useConnectProviderName();

  const interactionLabels = useMemo(
    () => ({
      placeholder: t("chat:questionCard.placeholder"),
      escapePlaceholder: t("chat:questionCard.escapePlaceholder"),
      send: t("chat:questionCard.send"),
      skip: t("chat:interaction.skip"),
      esc: t("chat:interaction.esc"),
      back: t("chat:questionCard.back"),
      forward: t("chat:questionCard.forward"),
      dismiss: t("chat:questionCard.dismiss"),
      collapse: t("chat:interaction.collapse"),
      expand: t("chat:interaction.expand"),
      recommended: t("chat:interaction.recommended"),
      attachedAnswer: t("chat:questionCard.attachedAnswer"),
      uploadFiles: t("chat:questionCard.uploadFiles"),
      filePlaceholder: t("chat:questionCard.filePlaceholder"),
      progress: (current: number, total: number) =>
        t("chat:questionCard.progress", { current, total }),
    }),
    [t],
  );

  const [dismissedPlanReady, setDismissedPlanReady] = useState<string | null>(
    null,
  );
  const [dismissedSuggestReusable, setDismissedSuggestReusable] = useState<
    string | null
  >(null);
  const [dismissedSuggestActions, setDismissedSuggestActions] = useState<
    string | null
  >(null);
  const [abandonedInteractionKey, setAbandonedInteractionKey] = useState<
    string | null
  >(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedSessionKey is the intentional change-trigger that clears all four suppression states when the open conversation switches, so a dismissed or abandoned card never suppresses a new chat's card. The effect body deliberately reads none of it.
  useEffect(() => {
    setDismissedPlanReady(null);
    setDismissedSuggestReusable(null);
    setDismissedSuggestActions(null);
    setAbandonedInteractionKey(null);
  }, [selectedSessionKey]);
  useEffect(() => {
    if (!turnRunning) return;
    setDismissedPlanReady(null);
    setDismissedSuggestReusable(null);
    setDismissedSuggestActions(null);
    setAbandonedInteractionKey(null);
  }, [turnRunning]);

  const {
    clearPersistedInteraction,
    dismissInteractionStep,
    resyncInteraction,
  } = usePersistedInteraction({
    agentPath: path,
    activityId: selectedActivityId,
    sessionKey: selectedSessionKey,
  });

  const dismissActiveInteraction = useCallback(() => {
    if (!path || !selectedSessionKey || !interactionKey) return;
    setAbandonedInteractionKey(interactionKey);
    void (async () => {
      const outcome = await tauriChat
        .dismissInteraction(path, selectedSessionKey)
        .catch(() => null);
      if (outcome && !outcome.ok) {
        setAbandonedInteractionKey(null);
        resyncInteraction();
        if (outcome.refusal === "not_interaction_owner") {
          showExpectedStateToast(
            t("chat:errors.interactionNotYoursTitle"),
            t("chat:errors.interactionNotYoursBody"),
          );
          return;
        }
        showExpectedStateToast(
          t("chat:errors.interactionBusyTitle"),
          t("chat:errors.interactionBusyBody"),
        );
        return;
      }
      if (await clearPersistedInteraction())
        useInteractionDraftStore.getState().clear(selectedSessionKey);
    })();
  }, [
    path,
    selectedSessionKey,
    interactionKey,
    clearPersistedInteraction,
    resyncInteraction,
    t,
  ]);

  const startPlan = useCallback(
    (mode: TurnMode, text: string) => {
      void handleModeSelect(mode);
      void sendInteractionMessage(text, mode);
    },
    [handleModeSelect, sendInteractionMessage],
  );

  const planReadyLabels = useMemo<ChatPlanReadyLabels>(
    () => ({
      title: t("chat:planReady.title"),
      collapse: t("chat:planReady.collapse"),
      expand: t("chat:planReady.expand"),
      askFirstTitle: t("chat:planReady.askFirstTitle"),
      askFirstDescription: t("chat:planReady.askFirstDescription"),
      autopilotTitle: t("chat:planReady.autopilotTitle"),
      autopilotDescription: t("chat:planReady.autopilotDescription"),
      dismiss: t("chat:questionCard.dismiss"),
      feedbackPlaceholder: t("chat:planReady.feedbackPlaceholder"),
      send: t("chat:questionCard.send"),
    }),
    [t],
  );

  const suggestReusableLabels = useMemo<ChatSuggestReusableLabels>(
    () => ({
      eyebrow: t("chat:suggestReusable.title"),
      skillTitle: t("chat:suggestReusable.skillTitle"),
      routineTitle: t("chat:suggestReusable.routineTitle"),
      learningTitle: t("chat:suggestReusable.learningTitle"),
      notNow: t("chat:interaction.notNow"),
    }),
    [t],
  );

  const suggestActionsLabels = useMemo<ChatSuggestActionsLabels>(
    () => ({
      heading: t("chat:suggestActions.heading"),
      dismiss: t("chat:suggestActions.dismiss"),
    }),
    [t],
  );

  const missionListLabels = useMemo<ChatMissionListLabels>(
    () => ({ heading: t("chat:childMissions.heading") }),
    [t],
  );

  const parentMissionLabels = useMemo<ChatParentMissionLinkLabels>(
    () => ({ label: t("chat:childMissions.goToMain") }),
    [t],
  );

  const saveReusable = useCallback(
    (step: SuggestReusableStep) => {
      setDismissedSuggestReusable(step.id);
      const text =
        step.reusableKind === "skill"
          ? t("chat:suggestReusable.saveSkillMessage", { title: step.title })
          : step.reusableKind === "routine"
            ? t("chat:suggestReusable.saveRoutineMessage", {
                title: step.title,
              })
            : t("chat:suggestReusable.saveLearningMessage", {
                title: step.title,
              });
      void sendInteractionMessage(text, "execute");
    },
    [sendInteractionMessage, t],
  );

  const composerOverrideState = useMemo<{
    node: AIBoardProps["composerOverride"];
    mode: "above" | "replace";
  }>(() => {
    const none = { node: undefined, mode: "above" as const };
    if (
      shouldShowConnectAiEmptyState(!!connectAiComposer.node, activeInteraction)
    )
      return { mode: "replace" as const, node: connectAiComposer.node };
    const missionsNode = childMissions.length ? (
      <ChatMissionList
        labels={missionListLabels}
        missions={childMissions}
        onOpen={(id) => onOpenChildMission?.(id)}
      />
    ) : parentMission ? (
      <ChatParentMissionLink
        labels={parentMissionLabels}
        onOpen={() => onOpenChildMission?.(parentMission.id)}
        title={parentMission.title}
      />
    ) : null;
    if (!agent || !activeInteraction)
      return missionsNode
        ? { mode: "above" as const, node: missionsNode }
        : none;
    if (interactionKey === abandonedInteractionKey) return none;
    if (hasOnlySuggestionSteps(activeInteraction.steps)) {
      const actions = resolveSuggestActionsOverride(
        activeInteraction.steps,
        dismissedSuggestActions,
      );
      const reusable = resolveSuggestReusableOverride(
        activeInteraction.steps,
        dismissedSuggestReusable,
      );
      if (actions.kind === "none" && reusable.kind === "none")
        return missionsNode
          ? { mode: "above" as const, node: missionsNode }
          : none;
      return {
        mode: "above",
        node: (
          <div className="flex flex-col gap-3">
            {missionsNode}
            {actions.kind === "bubbles" && !missionsNode ? (
              <ChatSuggestActions
                actions={actions.step.actions}
                labels={suggestActionsLabels}
                onDismiss={() => {
                  setDismissedSuggestActions(actions.step.id);
                  void dismissInteractionStep(
                    activeInteraction,
                    actions.step.id,
                  );
                }}
                onSelect={(action) => {
                  useDraftStore
                    .getState()
                    .setDraftText(draftKey, action.message);
                }}
              />
            ) : null}
            {reusable.kind === "card" ? (
              <ChatSuggestReusableCard
                labels={suggestReusableLabels}
                onDismiss={() => {
                  setDismissedSuggestReusable(reusable.step.id);
                  void dismissInteractionStep(
                    activeInteraction,
                    reusable.step.id,
                  );
                }}
                onSave={() => saveReusable(reusable.step)}
                rationale={reusable.step.rationale}
                reusableKind={reusable.step.reusableKind}
                title={reusable.step.title}
              />
            ) : null}
          </div>
        ),
      };
    }
    const override = resolvePlanReadyOverride(
      activeInteraction.steps,
      dismissedPlanReady,
    );
    if (override.kind === "none") return none;
    if (override.kind === "card") {
      const summary = override.summary;
      return {
        mode: "replace",
        node: (
          <ChatPlanReadyCard
            summary={summary}
            labels={planReadyLabels}
            onStartWorking={() =>
              startPlan("execute", t("chat:planReady.startWorkingMessage"))
            }
            onRunAutopilot={() =>
              startPlan("auto", t("chat:planReady.runAutopilotMessage"))
            }
            onDismiss={() => setDismissedPlanReady(summary)}
            onSubmit={(text) => startPlan("plan", text)}
          />
        ),
      };
    }
    return {
      mode: "replace",
      node: chatInteractionStepsNode({
        steps: override.steps,
        agentId: agent.id,
        conversationId: selectedSessionKey,
        accountScope: integrationAccountScope,
        labels: interactionLabels,
        approvalCopy,
        resolveBrand,
        resolveProviderName,
        onDismiss: dismissActiveInteraction,
        onSend: sendInteractionMessage,
        t,
      }),
    };
  }, [
    connectAiComposer.node,
    integrationAccountScope,
    agent,
    selectedSessionKey,
    activeInteraction,
    interactionKey,
    abandonedInteractionKey,
    dismissedPlanReady,
    dismissedSuggestReusable,
    dismissedSuggestActions,
    planReadyLabels,
    suggestReusableLabels,
    suggestActionsLabels,
    missionListLabels,
    parentMissionLabels,
    childMissions,
    parentMission,
    onOpenChildMission,
    startPlan,
    saveReusable,
    interactionLabels,
    sendInteractionMessage,
    draftKey,
    dismissInteractionStep,
    dismissActiveInteraction,
    resolveBrand,
    resolveProviderName,
    approvalCopy,
    t,
  ]);
  const planComposer = usePlanComposerState();
  const composerOverride = planComposer.limit ?? composerOverrideState.node;
  const composerOverrideMode = planComposer.limit
    ? "replace"
    : composerOverrideState.mode;
  const offersComposerOverride =
    composerOverrideMode === "above" ? composerOverride : undefined;

  const onComposerSubmit = useCallback<
    NonNullable<AIBoardProps["onComposerSubmit"]>
  >(
    async (ctx) => {
      if (activeInteraction && interactionKey !== abandonedInteractionKey)
        setAbandonedInteractionKey(interactionKey);
      return submitWithCitations(
        ctx,
        citationComposer.prepare,
        handleSkillComposerSubmit,
      );
    },
    [
      citationComposer.prepare,
      handleSkillComposerSubmit,
      activeInteraction,
      interactionKey,
      abandonedInteractionKey,
    ],
  );

  const renderUserMessage = useCallback(
    (msg: { content: string }) => {
      const cited = decodeCitedMessage(msg.content);
      if (cited && path)
        return (
          <CitedUserMessage
            cited={cited}
            attachmentLabels={attachmentLabels}
            agentPath={path}
            draftKey={selectedSessionKey}
          />
        );
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
      if (attachmentInvocation) {
        return (
          <UserAttachmentMessage
            invocation={attachmentInvocation}
            labels={attachmentLabels}
          />
        );
      }
      const interactionAnswers = decodeInteractionAnswersMessage(msg.content);
      if (interactionAnswers) {
        return <UserInteractionAnswersMessage payload={interactionAnswers} />;
      }
      return undefined;
    },
    [attachmentLabels, path, selectedSessionKey],
  );
  const cardProvider = errorCardProvider({
    activityProvider,
    agentProvider,
    lastUsedProvider,
  });
  const renderSystemMessage = useCallback(
    (msg: ChatMessage) => {
      if (msg.compaction)
        return <ContextCompactedDivider info={msg.compaction} />;
      if (msg.providerError) {
        const providerError = resolveProviderErrorForChat(
          msg.providerError,
          cardProvider,
        );
        return (
          <ProviderErrorCard
            error={providerError}
            onRetry={async () => {
              if (!path || !selectedSessionKey) return;
              const continues = continuesTaskAfterReconnect(providerError);
              const continueText = reconnectContinueText(
                providerError,
                t("chat:providerError.reconnectedContinue"),
              );
              const text = continues
                ? encodeAutoContinueMessage(continueText)
                : providerErrorRetryText(
                    providerError,
                    t("chat:providerError.retryPrompt"),
                  );
              const pin = await resolveSendPin();
              await tauriChat.send(path, text, selectedSessionKey, {
                providerOverride: pin.provider,
                modelOverride: pin.model,
                effortOverride: pin.effort,
                modeOverride: turnMode,
                suppressUserBubble: resendsOriginalPrompt(providerError),
                autoResume: providerError.kind === "unauthenticated",
              });
              onSendReactivatedRef.current?.();
            }}
            onSwitchModel={() => setModelPickerOpen(true)}
            onApplyModel={(model) =>
              selectModel(displayModelPin.provider, model)
            }
          />
        );
      }
      if (isProviderAuthMessage(msg.content)) return null;
      if (msg.notice === "files_not_saved")
        return <FilesNotSavedNote data={msg.noticeData} />;
      if (msg.notice) return <SystemNote text={t(NOTICE_COPY[msg.notice])} />;
      return undefined;
    },
    [
      displayModelPin,
      resolveSendPin,
      cardProvider,
      turnMode,
      selectModel,
      path,
      selectedSessionKey,
      t,
    ],
  );
  const welcomeGreetingRevealed =
    useWelcomeGreetingRevealed(selectedSessionKey);
  const agentName = agent?.name;
  const { isSetupMission, hello: setupHello } = useSetupHello({
    agentPath: path,
    sessionKey: selectedSessionKey,
    activityAgentMode: selectedActivity?.agent,
    agentName,
  });
  const mapFeedItems = useCallback(
    ({ sessionKey, items }: { sessionKey: string; items: FeedItem[] }) => {
      const mapped = filterAutoContinueFeedItems(
        filterProviderAuthFeedItems(items),
      );
      if (isWelcomeSessionKey(sessionKey) && welcomeGreetingRevealed) {
        const greeting: FeedItem = {
          feed_type: "assistant_text",
          data: t("chat:welcome.greeting", { name: agentName }),
        };
        return [greeting, ...mapped];
      }
      if (setupHello && sessionKey === selectedSessionKey) {
        const { variant, params } = setupGreetingCopy(
          setupHello.name,
          setupHello.role,
        );
        const hello: FeedItem = {
          feed_type: "assistant_text",
          data: t(`chat:setupGreeting.${variant}`, params),
        };
        return [hello, ...mapped];
      }
      return mapped;
    },
    [welcomeGreetingRevealed, agentName, setupHello, selectedSessionKey, t],
  );
  const browserHandoff = useBrowserHandoffCards({
    mapFeedItems,
    renderSystemMessage,
    agentPath: path ?? undefined,
    runningSessionKey: turnRunning ? selectedSessionKey : null,
  });
  const afterMessages = useCallback(
    ({ feedItems }: { sessionKey: string; feedItems: FeedItem[] }) => {
      const hasInlineAuthCard = feedItems.some(isInlineAuthCard);
      if (hasInlineAuthCard) return null;
      if (connectAiComposer.active) return null;
      const signalKey = providerAuthSignalKey(feedItems);
      return (
        <ProviderReconnectCard
          providerId={effectiveProvider}
          signalKey={signalKey ?? undefined}
        />
      );
    },
    [effectiveProvider, connectAiComposer.active],
  );

  const composerHeader = useMemo<AIBoardProps["composerHeader"]>(() => {
    if (!agent) return undefined;
    if (!activeSkill && !planComposer.hint && !citationComposer.header)
      return undefined;
    return (
      <div className="flex flex-col gap-1.5">
        {citationComposer.header}
        {activeSkill && (
          <SelectedSkillChip
            skill={activeSkill}
            onCancel={() => setActiveSkill(null)}
          />
        )}
        {planComposer.hint}
      </div>
    );
  }, [agent, activeSkill, planComposer.hint, citationComposer.header]);

  const chatEmptyState = useMemo<AIBoardProps["chatEmptyState"]>(() => {
    if (!agent) return undefined;
    if (isWelcomeSessionKey(selectedSessionKey)) return undefined;
    if (isSetupMission) return undefined;
    if (activeSkill) return null;
    if (emptySkillShowcase.length === 0) return undefined;
    return (
      <div className="self-stretch w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-6 pt-6 pb-4 flex flex-col gap-3">
          <div className="text-center mb-1">
            <h3 className="text-base font-semibold text-ink">
              {t("chatEmpty.heading")}
            </h3>
            <p className="text-sm text-ink-muted mt-1">
              {t("chatEmpty.subheading")}
            </p>
          </div>
          {emptySkillShowcase.map((s) => (
            <SkillCard
              key={s.name}
              image={s.image}
              title={skillDisplayTitle(s)}
              description={s.description}
              footer={skillIntegrationChips(s.integrations)}
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
  }, [
    agent,
    activeSkill,
    emptySkillShowcase,
    moreSkillsCount,
    t,
    applySkill,
    selectedSessionKey,
    isSetupMission,
  ]);

  const footer = useMemo<AIBoardProps["footer"]>(() => {
    if (!agent) return undefined;
    return () => (
      <div
        data-testid="composer-toolbar"
        className="flex w-full items-center gap-1 md:gap-2"
      >
        <div
          data-testid="composer-toolbar-pickers"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-0.5 [scrollbar-width:none] md:gap-2 md:overflow-visible md:p-0"
        >
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="hidden md:inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium text-ink-muted whitespace-nowrap hover:text-ink hover:bg-hover transition-colors"
          >
            <Play className="size-3 fill-current" />
            {t("composerSkill.browse")}
          </button>
          <ChatModeSelector
            mode={turnMode}
            onSelect={handleModeSelect}
            agent={agent}
          />
          <ChatModelSelector
            provider={displayModelPin.provider}
            model={displayModelPin.model}
            onSelect={selectModel}
            open={modelPickerOpen}
            onOpenChange={setModelPickerOpen}
            agent={agent}
            allowedModels={allowedModels}
          />
          <ChatEffortSelector
            provider={displayModelPin.provider}
            model={displayModelPin.model}
            effort={displayModelPin.effort}
            onSelect={selectEffort}
            agent={agent}
          />
        </div>
        <div className="shrink-0">
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
    displayModelPin,
    selectModel,
    selectEffort,
    turnMode,
    handleModeSelect,
    allowedModels,
    contextUsage,
    contextWindow,
    modelPickerOpen,
  ]);

  const attachMenu = useMemo<AIBoardProps["attachMenu"]>(() => {
    if (!agent) return undefined;
    return ({ openFilePicker, openFolderPicker, close }) => (
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            close();
            setPickerOpen(true);
          }}
          className="flex md:hidden items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink hover:bg-hover transition-colors"
        >
          <Play className="size-4 text-ink-muted" />
          {t("composerSkill.browse")}
        </button>
        <button
          type="button"
          onClick={() => {
            openFilePicker();
          }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink hover:bg-hover transition-colors"
        >
          <Paperclip className="size-4 text-ink-muted" />
          {t("composerAttach.addFiles")}
        </button>
        <button
          type="button"
          onClick={() => {
            openFolderPicker();
          }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink hover:bg-hover transition-colors"
        >
          <FolderUp className="size-4 text-ink-muted" />
          {t("composerAttach.addFolder")}
        </button>
      </div>
    );
  }, [agent, t]);

  const pickerDialog = agent ? (
    <>
      <NewMissionPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        lockedAgent={agent}
        onSkill={(skillName) => {
          const skill = (allSkills ?? []).find((s) => s.name === skillName);
          if (skill) applySkill(skill);
        }}
      />
      <ProviderSwitchDialog
        open={switchDialog !== null}
        providerId={switchDialog?.toProvider ?? ""}
        mode={switchDialog?.mode ?? "replay"}
        onConfirm={confirmProviderSwitch}
        onCancel={() => setSwitchDialog(null)}
      />
      <DictationSetupDialog modelSetup={modelSetup} />
    </>
  ) : null;

  return {
    chatEmptyState,
    composerHeader,
    composerOverride,
    composerOverrideMode,
    offersComposerOverride,
    canSendEmpty: activeSkill != null || citationComposer.count > 0,
    onComposerSubmit,
    footer,
    attachMenu,
    renderUserMessage,
    onEditMessage: turnRunning ? undefined : onEditMessage,
    canEditMessage,
    editMessageLabel: t("chat:editMessage.edit"),
    messageEditing,
    enableMessageCopy: true,
    canCopyMessage,
    copyMessageLabel: t("chat:copyMessage.copy"),
    renderLink,
    openHref,
    isSpecialTool,
    renderToolResult,
    processLabels,
    getThinkingMessage,
    thinkingIndicator:
      conversationVm?.sendWaiting === "busy"
        ? busyIndicator
        : thinkingIndicator,
    renderTurnSummary,
    renderSystemMessage: browserHandoff.renderSystemMessage,
    conversationMap,
    mapFeedItems: browserHandoff.mapFeedItems,
    afterMessages,
    pickerDialog,
    effectiveProvider: displayModelPin.provider,
    effectiveModel: displayModelPin.model,
    effectiveEffort: displayModelPin.effort,
    resolveSendPin,
    turnMode,
    currentUserId,
    authorLabels,
    showSenders,
    agentLabel,
    renderSenderAvatar,
    senderNameClass,
    mentionProps,
    dictation,
  };
}

const hasCitations = (content: string) => decodeCitedMessage(content) !== null;
