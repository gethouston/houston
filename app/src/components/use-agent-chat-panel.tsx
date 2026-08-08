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

// Subpath import (like `lib/active-interaction.ts`): value imports from the
// package index only resolve under bundler resolution.
import { hasOnlySuggestionSteps } from "@houston/protocol/interaction";
import type { AIBoardProps } from "@houston-ai/board";
import type { ChatMessage, ChatPanelProps, FeedItem } from "@houston-ai/chat";
import {
  type ChatInteractionAnswer,
  ChatInteractionCard,
  type ChatInteractionStep,
  ChatMissionList,
  type ChatMissionListItem,
  type ChatMissionListLabels,
  ChatPlanReadyCard,
  type ChatPlanReadyLabels,
  ChatSuggestActions,
  type ChatSuggestActionsLabels,
  ChatSuggestReusableCard,
  type ChatSuggestReusableLabels,
  decodeAttachmentMessage,
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
import {
  useActivity,
  useAgentModelChoice,
  useChatHistory,
  useSetAgentModelChoice,
  useSkills,
} from "../hooks/queries";
import { useCapabilities } from "../hooks/use-capabilities";
import { useConnectAiComposer } from "../hooks/use-connect-ai-composer";
import {
  useConversationFeed,
  useConversationVm,
} from "../hooks/use-conversation-vm";
import { useFileToolRenderer } from "../hooks/use-file-tool-renderer";
import { useProviderStatuses } from "../hooks/use-provider-statuses";
import { useSession } from "../hooks/use-session";
import { useSetupGreetingName } from "../hooks/use-setup-greeting";
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
import {
  effectiveContextWindow,
  sessionContextUsage,
} from "../lib/context-usage";
import { createMission } from "../lib/create-mission";
import { resolveDictationLangHint } from "../lib/dictation/types";
import { useDictation } from "../lib/dictation/use-dictation";
import { genericErrorDescription } from "../lib/error-report";
import { skillDisplayTitle } from "../lib/humanize-skill-name";
import {
  type ConnectOutcome,
  type CredentialOutcome,
  encodeInteractionAnswersMessage,
  finalConnectNames,
  finalCredentialNames,
} from "../lib/interaction-reply";
import {
  isModelAllowed,
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
  PROVIDERS,
  validEffortOrDefault,
  validModelOrNull,
} from "../lib/providers";
import { queryKeys } from "../lib/query-keys";
import { hasAgentOutput } from "../lib/setup-mission-greeting";
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
import { DEFAULT_TURN_MODE, type TurnMode } from "../lib/turn-mode";
import type { Agent, AgentDefinition, SkillSummary } from "../lib/types";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { newConversationDraftKey, useDraftStore } from "../stores/drafts";
import { useUIStore } from "../stores/ui";
import { ChatConnectInteractionCard } from "./chat-connect-interaction-card";
import { ChatCredentialInteractionCard } from "./chat-credential-interaction-card";
import { resolveEffectiveProvider } from "./chat-effective-provider";
import { ChatEffortSelector } from "./chat-effort-selector";
import { ChatModeSelector } from "./chat-mode-selector";
import { ChatModelSelector } from "./chat-model-selector";
import { ChatSigninInteractionCard } from "./chat-signin-interaction-card";
import { ContextCompactedDivider } from "./context-compacted-divider";
import { ContextIndicator } from "./context-indicator";
import { DictationSetupDialog } from "./dictation-setup-dialog";
import { IntegrationConnectCard } from "./integration-connect-card";
import { parseToolkitFromHref } from "./integration-connect-card-state";
import { integrationsSupported } from "./integrations/model";
import { NewMissionPickerDialog } from "./new-mission-picker-dialog";
import { ProviderSwitchDialog } from "./provider-switch-dialog";
import { SelectedSkillChip } from "./selected-skill-chip";
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
import { ToolRuntimeErrorCard } from "./shell/tool-runtime-error-card";
import { SkillCard } from "./skill-card";
import { skillIntegrationChips } from "./skill-integration-chips";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "./tabs/provider-auth-feed";
import { isToolRuntimeErrorMessage } from "./tool-runtime-feed";
import { useChatDisplayLabels } from "./use-chat-display-labels";
import { type ChatMentionProps, useChatMentions } from "./use-chat-mentions";
import { useChatSenderAvatars } from "./use-chat-sender-avatars";
import { usePersistedInteraction } from "./use-persisted-interaction";
import { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";
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
  /** New-conversation draft scope — must match the board's `useBoardDrafts`
   *  scope so dictation lands in the composer the user sees (HOU-730). */
  draftScope?: string;
  /** Seeds the composer's turn mode for THIS surface and suppresses the
   *  per-agent config mode from overwriting it, so the surface opens on the
   *  given mode and keeps it until the user changes it in-session. The routine
   *  setup chat passes `"execute"` (Ask first) — its kickoff turn runs Ask first,
   *  so the live composer must match. Omit to keep today's behavior exactly
   *  (seed the global default, then load the agent's remembered mode). */
  initialTurnMode?: TurnMode;
  /** Fires after a send THIS HOOK owns LANDS — every one that bypasses the
   *  surface's own `onSendMessage`: an interaction offer (suggested-action
   *  bubble, completed stepper, accepted save-as-reusable, plan-ready choice)
   *  and a Skill submitted into an existing conversation. Each starts a turn,
   *  which re-activates an ARCHIVED mission, so a surface that must react to
   *  that (the archived views, which have to hand the user off to the active
   *  board) wires its handoff here. Never called when the send fails — the
   *  failure surfaces on its own and the user stays where they are. */
  onSendReactivated?: () => void;
  /** The missions this chat started (PRODUCT-1244), already resolved + ordered
   *  by the surface that owns the board data. Listed above the composer in
   *  place of the generic follow-up bubbles. Omit on surfaces with no board
   *  behind them (the setup chats) and nothing renders. */
  childMissions?: ChatMissionListItem[];
  /** Opens one of {@link childMissions} — the board's own selection. */
  onOpenChildMission?: (id: string) => void;
}

/** Stable empty default, so the no-children case never re-runs the memo. */
const EMPTY_CHILD_MISSIONS: ChatMissionListItem[] = [];

function resolveCatalogProvider(model: string): string | null {
  return (
    PROVIDERS.find((provider) =>
      provider.models.some((candidate) => candidate.id === model),
    )?.id ?? null
  );
}

interface AgentChatPanelProps {
  /** Renders skill cards + "see more" when no Skill is in flight. */
  chatEmptyState: AIBoardProps["chatEmptyState"];
  /** Selected Skill chip rendered above the prompt input. */
  composerHeader: AIBoardProps["composerHeader"];
  /** The pending-interaction card shown when the mission is waiting on the user
   *  (ask_user / request_connection / credential), or a lighter
   *  plan_ready / suggest_reusable / suggest_actions offer. Undefined when nothing is pending or a
   *  turn is running. Pair it with {@link composerOverrideMode}. */
  composerOverride: AIBoardProps["composerOverride"];
  /** How the override composes with the input: interaction cards with their own
   *  free-text row pass `"replace"` (the composer is not rendered under them),
   *  while suggestion offers pass `"above"`. */
  composerOverrideMode: AIBoardProps["composerOverrideMode"];
  /** {@link composerOverride} narrowed to the NON-BLOCKING clean-finish offers
   *  (mode `"above"`), for the archived surfaces. Archiving a mission does not
   *  answer what it was waiting on, so a mission archived mid-question still
   *  carries blocking steps — and a composer-REPLACING stepper inside a
   *  read-mostly archived list is a dead end. The offers are welcome there:
   *  acting on one sends a message, which re-activates the mission like any
   *  other send. Pair it with `composerOverrideMode="above"`. */
  offersComposerOverride: AIBoardProps["composerOverride"];
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
  /** Renders agent-authored `#houston_toolkit=` links as connect cards. */
  renderLink: AIBoardProps["renderLink"];
  /** Forwarded to AIBoard / ChatPanel for tool rendering. */
  isSpecialTool: ChatPanelProps["isSpecialTool"];
  renderToolResult: ChatPanelProps["renderToolResult"];
  processLabels: ChatPanelProps["processLabels"];
  getThinkingMessage: ChatPanelProps["getThinkingMessage"];
  thinkingIndicator: ChatPanelProps["thinkingIndicator"];
  renderTurnSummary: ChatPanelProps["renderTurnSummary"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  /** Props-only copy and metadata-only analytics for Conversation Map. */
  conversationMap: AIBoardProps["conversationMap"];
  mapFeedItems: AIBoardProps["mapFeedItems"];
  afterMessages: AIBoardProps["afterMessages"];
  /** Hidden picker dialog mounted in the consumer. */
  pickerDialog: ReactNode;
  /** Displayed provider/model for sending. */
  effectiveProvider: string;
  effectiveModel: string;
  /** The composer's turn mode (execute | plan); consumers forward it as
   *  `modeOverride` on user-typed sends — an unpinned turn is execute. */
  turnMode: TurnMode;
  /** Multiplayer only (C5): the signed-in viewer's user id, for attributing
   *  teammates' messages. Undefined when signed out / single-player. */
  currentUserId: ChatPanelProps["currentUserId"];
  /** Localized author-attribution labels forwarded to ChatPanel. */
  authorLabels: ChatPanelProps["authorLabels"];
  /** Attribute EVERY turn (HOU-943): true whenever the deployment is
   *  multiplayer, so a shared chat always says who sent each message.
   *  Single-player stays false and the transcript is unchanged. */
  showSenders: ChatPanelProps["showSenders"];
  /** The agent's display name, shown on its own rows when senders show. */
  agentLabel: ChatPanelProps["agentLabel"];
  /** Face for a message's sender: teammate photo/initials, or the agent mark. */
  renderSenderAvatar: ChatPanelProps["renderSenderAvatar"];
  /** Text colour for a sender's NAME: their person tone, or the agent's own
   *  avatar colour (HOU-960). */
  senderNameClass: ChatPanelProps["senderNameClass"];
  /** The @mention props (HOU-944), spread as ONE group at every AIBoard mount:
   *  the composer's roster, the render roster, the row face and the labels.
   *  Every list is empty off multiplayer, so "@" just types plainly. */
  mentionProps: ChatMentionProps;
  /** Prop-driven dictation control for the composer mic. Undefined on web
   *  (no native mic capture) — ChatPanel hides the mic entirely. */
  dictation: ChatPanelProps["dictation"];
}

export function useAgentChatPanel({
  agent,
  agentDef,
  selectedSessionKey,
  onSelectSession,
  draftScope,
  initialTurnMode,
  onSendReactivated,
  childMissions = EMPTY_CHILD_MISSIONS,
  onOpenChildMission,
}: UseAgentChatPanelArgs): AgentChatPanelProps {
  const { t, i18n } = useTranslation(["board", "chat", "dashboard", "teams"]);
  const { processLabels, getThinkingMessage, thinkingIndicator } =
    useChatDisplayLabels();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  // Multiplayer attribution (C5): the signed-in viewer's id lets ChatPanel tell
  // the viewer's own bubbles from teammates'. Undefined signed out / local.
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
        view: t("chat:conversationMap.view"),
        hide: t("chat:conversationMap.hide"),
        backToLatest: t("chat:conversationMap.backToLatest"),
        empty: t("chat:conversationMap.empty"),
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

  // ── Dictation (desktop-only voice typing) ──────────────────────────────
  // Transcript text is appended to the SAME draft store AIBoard's
  // `drafts`/`onDraftChange` read from (`useBoardDrafts` in mission-board.tsx)
  // — the key mirrors the board's own derivation (AIBoard's plain
  // "new-conversation" translated through `useBoardDrafts`'s scope), so
  // dictating into a fresh composer lands in the same draft the user would
  // see if they typed instead.
  const draftKey = selectedSessionKey ?? newConversationDraftKey(draftScope);
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

  // Integration connect cards are a new-engine feature: the host advertises
  // its wired providers in capabilities; the legacy Rust engine (null) and
  // unconfigured deployments fall back to plain markdown links.
  const { capabilities } = useCapabilities();
  const integrationsEnabled = integrationsSupported(capabilities);

  // Teams E8: in a multiplayer Teams org the composer's model + effort pickers
  // read+write the ACTING user's PERSONAL per-agent choice (clamped to the
  // agent's allowed-models ceiling), not the shared agent config. Single-player
  // / self-host keeps the shared-config behavior (personal=false, no ceiling).
  // The gateway is the sole enforcer of the ceiling per turn.
  const modelDecision = modelSelectorDecision(capabilities, agent);
  const { data: modelChoiceInfo } = useAgentModelChoice(
    agent?.id ?? "",
    modelDecision.personal,
  );
  const setModelChoice = useSetAgentModelChoice(agent?.id ?? "");
  const allowedModels = modelDecision.personal
    ? (modelChoiceInfo?.allowedModels ?? null)
    : null;

  const path = agent?.folderPath ?? null;
  const agentModes = agentDef?.config.agents;

  // Opening an agent whose hosted pod is scaled to zero (HOU-730): the open
  // itself starts the wake, but every request is held for the whole cold
  // start — a first message sent then would hang with no bubble. Detect the
  // asleep engine now so sends park with the same warming machinery a
  // just-created agent uses, and flush the moment the pod answers.
  const agentId = agent?.id ?? null;
  useEffect(() => {
    if (!agentId || !path) return;
    useAgentProvisioningStore
      .getState()
      .detectSleepingEngine({ id: agentId, folderPath: path });
  }, [agentId, path]);

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
  // Composer "Mode" pin (execute/plan/auto). It is session-local and every new
  // mission resets to `initialTurnMode` or Ask First. Existing mission switches
  // keep the current per-send pin until the user changes it.
  const [turnMode, setTurnMode] = useState<TurnMode>(
    initialTurnMode ?? DEFAULT_TURN_MODE,
  );
  useEffect(() => {
    if (!path) {
      setAgentProvider(null);
      setAgentModel(null);
      setAgentEffort(null);
      setTurnMode(initialTurnMode ?? DEFAULT_TURN_MODE);
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
  }, [path, initialTurnMode]);

  const previousSessionKeyRef = useRef(selectedSessionKey);
  useEffect(() => {
    const previousSessionKey = previousSessionKeyRef.current;
    previousSessionKeyRef.current = selectedSessionKey;
    if (previousSessionKey && !selectedSessionKey) {
      setTurnMode(initialTurnMode ?? DEFAULT_TURN_MODE);
    }
  }, [selectedSessionKey, initialTurnMode]);

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
  const selectedActivityId = selectedActivity?.id ?? null;

  // A pick applied to the OPEN chat, echoed locally until the activity query
  // reflects the write (the optimistic flip for the dropdown). Scoped to one
  // activity id so it can never leak into another chat's dropdown.
  const [pickedPin, setPickedPin] = useState<{
    activityId: string;
    provider: string;
    model: string;
  } | null>(null);
  useEffect(() => {
    if (!pickedPin) return;
    if (
      selectedActivity?.id === pickedPin.activityId &&
      selectedActivity.provider === pickedPin.provider &&
      selectedActivity.model === pickedPin.model
    )
      setPickedPin(null);
  }, [selectedActivity, pickedPin]);

  const pinForSelected =
    pickedPin && pickedPin.activityId === selectedActivityId ? pickedPin : null;
  const activityProvider =
    pinForSelected?.provider ?? selectedActivity?.provider ?? null;
  const activityModel = normalizeLegacyModel(
    pinForSelected?.model ?? selectedActivity?.model ?? null,
  );

  // Which providers the user is actually logged into (reactive + cached), read
  // through the ONE shared derivation (HOU-979) rather than the denormalized
  // `authenticated` flag. The fallback below picks a CONFIRMED-connected one
  // rather than a stale preference, so a no-provider agent never lands on a
  // logged-out account (#483) — and an unconfirmable probe is kept separate, so
  // it neither becomes a fallback target nor disqualifies the preferred one.
  const {
    statuses: providerStatuses,
    isLoading: providerStatusesLoading,
    isError: providerStatusesError,
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

  // With nothing connected the composer had no honest job: its picker showed a
  // phantom model (the effective-provider default) and its textarea accepted a
  // message no provider could answer. The whole input area is replaced by one
  // CTA into the AI Hub, and returns by itself once a provider connects (the
  // status query is invalidated on ProviderLoginComplete).
  const connectAiComposer = useConnectAiComposer({
    connectedCount: authedProviders.length,
    checkingCount: unconfirmedProviders.length,
    statusesLoading: providerStatusesLoading,
    statusesError: providerStatusesError,
  });

  // This conversation's reactive feed — the SDK conversation VM, the app's one
  // turn-state source (history seeded by the adapter on load; live turns
  // folded by the SDK machinery).
  // Live resync (HOU-731): the chat-history subscription makes a
  // ConversationsChanged event re-read the open conversation and reseed the
  // VM, so turns from a teammate / another device / a routine repaint live.
  useChatHistory(
    selectedSessionKey && path ? path : undefined,
    selectedSessionKey ?? undefined,
  );
  const sessionFeedItems = useConversationFeed(path, selectedSessionKey);

  // Sender identity (HOU-943): in a shared (multiplayer) deployment every turn
  // shows who sent it — the teammate's face + name, the agent's mark + name.
  // Resolved from the feed's authors, so it repaints as teammates' turns land.
  const { showSenders, agentLabel, renderSenderAvatar, senderNameClass } =
    useChatSenderAvatars(agent, sessionFeedItems);

  // @mentions of teammates (HOU-944): the space roster the composer offers and
  // the renderer chips against. Empty off multiplayer — "@" then types plainly.
  const mentionProps = useChatMentions();

  // The live turn state for this conversation, for the pending-interaction
  // override: `running` gates the card (a running turn shows the composer, not
  // the card) and `pendingInteraction` is the live source the derivation
  // prefers over the persisted activity fallback.
  const conversationVm = useConversationVm(path, selectedSessionKey);
  // Plain boolean so callbacks can depend on "is a turn running" without
  // re-creating on every VM tick (the VM reference churns while streaming).
  const turnRunning = conversationVm?.running ?? false;

  // Whether the open conversation already has turns. Once it does, the chat's
  // provider is frozen (see resolveEffectiveProvider): a provider that logs out
  // mid-conversation must surface the reconnect card, never silently hand the
  // turn to another connected provider.
  const hasMessages = sessionFeedItems.length > 0;

  const effectiveProvider = resolveEffectiveProvider(
    activityProvider,
    agentProvider,
    lastUsedProvider,
    authedProviders,
    hasMessages,
    unconfirmedProviders,
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
        resolveCatalogProvider,
      ),
    [
      modelChoiceInfo?.choice,
      allowedModels,
      effectiveProvider,
      effectiveModel,
      effectiveEffort,
    ],
  );

  // The provider/model/effort the composer picker displays and every send
  // forwards. In personal (Teams) mode an open mission's in-ceiling activity
  // pin wins for provider/model, while effort stays on the personal resolution.
  // Without a mission pin, the personal choice remains the default.
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
            resolveCatalogProvider,
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
    ],
  );
  const displayModelPin = useMemo(
    () => ({
      ...rawDisplayModelPin,
      effort: validEffortOrDefault(
        rawDisplayModelPin.provider,
        rawDisplayModelPin.model,
        rawDisplayModelPin.effort,
      ),
    }),
    [rawDisplayModelPin],
  );

  // Converge legacy pin-less chats (created before per-conversation pins):
  // stamp the shared agent-derived provider/model onto its activity, so a later
  // change to the agent
  // default can never move a chat that already ran (HOU-695). Chats created
  // now are stamped at creation (createMission); this covers the older ones,
  // once per activity per mount. Background convergence, not a user action:
  // a failure only postpones the stamp, so it logs instead of toasting.
  const stampedActivityIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!path || !selectedActivity || selectedActivity.provider) return;
    if (!hasMessages) return;
    if (stampedActivityIds.current.has(selectedActivity.id)) return;
    stampedActivityIds.current.add(selectedActivity.id);
    tauriActivity
      .update(path, selectedActivity.id, {
        provider: effectiveProvider,
        model: effectiveModel,
      })
      .catch((err) => {
        console.error("[chat] failed to pin the conversation's model:", err);
      });
  }, [path, selectedActivity, hasMessages, effectiveProvider, effectiveModel]);

  // ── Context-usage indicator ───────────────────────────────────────────
  // Latest turn's normalized usage from this session's feed, divided by a
  // self-correcting window estimate: the active model's catalogued default,
  // snapped up once the session's observed peak proves a larger (plan/credit-
  // gated) window. Drives the composer footer pill + dialog.
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

  // Persist a provider/model choice with an optimistic picker flip. Shared by
  // the plain pick and the post-consent switch path.
  //
  // Scope is the whole point (HOU-695): a pick inside an OPEN chat pins THAT
  // conversation only — its activity record, which every send forwards as the
  // turn's wire pin — and never touches the agent config other chats fall back
  // to. Only a pick in a fresh, message-less composer (no activity yet) writes
  // the agent config: that's the default the NEXT chats start on, and the
  // mission created on first send stamps it onto its own activity.
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
            provider: prov,
            model: mod,
          });
        } else if (modelDecision.personal) {
          await setModelChoice.mutateAsync({
            provider: prov,
            model: mod,
            effort: validEffortOrDefault(prov, mod, displayModelPin.effort),
          });
        } else {
          setAgentProvider(prov);
          setAgentModel(mod);
          if (path) {
            const cfg = await tauriConfig.read(path);
            await tauriConfig.write(path, {
              ...cfg,
              provider: prov,
              model: mod,
            });
          }
        }
        await tauriProvider.setLastUsed(prov, mod);
      } catch (err) {
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
      modelDecision.personal,
      setModelChoice,
      displayModelPin.effort,
      addToast,
      t,
    ],
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
        prov !== displayModelPin.provider;
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
      displayModelPin.provider,
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
          description: genericErrorDescription("model_persist_failed", err),
          variant: "error",
        });
      }
    },
    [path, addToast, t],
  );
  const handleModeSelect = useCallback(
    (mode: TurnMode) => {
      // Mode is session-local. Flip the picker optimistically and pin the pick
      // on each send.
      //
      // A pick while a turn is STREAMING also applies to that turn (Claude
      // Code's shift+tab): the runtime mutates the executing turn's live-mode
      // ref, so the agent adopts the new mode at its next tool decision.
      // `applied: false` (the turn settled while the request flew) is benign —
      // the next send pins the mode anyway — but a transport failure is
      // surfaced, with the honest "your next message still gets it" note.
      setTurnMode(mode);
      if (turnRunning && path && selectedSessionKey && mode !== turnMode) {
        const modeLabels: Record<TurnMode, string> = {
          execute: t("chat:modeSelector.askFirst"),
          plan: t("chat:modeSelector.planner"),
          auto: t("chat:modeSelector.autopilot"),
        };
        tauriChat.setLiveTurnMode(path, selectedSessionKey, mode).catch(() => {
          addToast({
            title: t("chat:modeSelector.liveApplyFailedTitle", {
              mode: modeLabels[mode],
            }),
            description: t("chat:modeSelector.liveApplyFailedBody"),
            variant: "error",
          });
        });
      }
    },
    [path, selectedSessionKey, addToast, t, turnRunning, turnMode],
  );

  // In personal (Teams) mode, a fresh-composer model pick updates the user's
  // default. A pick inside an open mission follows the activity-pin path,
  // including provider-switch consent, and can never write agent config.
  const selectModel = useCallback(
    (prov: string, mod: string) => {
      if (modelDecision.personal && !isModelAllowed(allowedModels, mod)) {
        addToast({
          title: t("chat:errors.modelNotAllowed"),
          variant: "error",
        });
        return;
      }
      if (modelDecision.personal && !selectedActivityId) {
        setModelChoice.mutate({
          provider: prov,
          model: mod,
          effort: validEffortOrDefault(prov, mod, displayModelPin.effort),
        });
        // The device's sticky default too: the create-agent dialog seeds from
        // it, so a hosted pick must register as "last used" like a shared-mode
        // pick does (applyProviderModel writes it on the other branches).
        tauriProvider.setLastUsed(prov, mod).catch(() => {});
        return;
      }
      void handleModelSelect(prov, mod);
    },
    [
      modelDecision.personal,
      allowedModels,
      addToast,
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
      setModelChoice,
      personalDefaultPin.provider,
      personalDefaultPin.model,
      handleEffortSelect,
    ],
  );

  // ── File-tool rendering (per-agent path) ──────────────────────────────
  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(path ?? "");

  // ── Skills + selected-skill state ─────────────────────────────────────
  const { data: allSkills } = useSkills(path ?? undefined);
  // Swap unedited English store skills for the workspace language's versions
  // (agents created before translated templates shipped, or in English).
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

  // Both consumer callbacks live in refs so the send callbacks that fire them
  // don't re-create (and re-render the override cards) every time the consumer
  // passes a fresh closure.
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

  // While a Skill is selected, the regular composer still owns text
  // and attachments. This hook only wraps the submitted message with the
  // hidden Skill marker + deterministic "Use the X skill" prompt.
  const handleSkillComposerSubmit = useCallback<
    NonNullable<AIBoardProps["onComposerSubmit"]>
  >(
    async ({ sessionKey, text, files, mentions }) => {
      const skill = activeSkill;
      if (!skill || !agent || !path) return false;

      const claudePrompt = buildSkillClaudePrompt(skill, text);
      const encoded = encodeSkillMessage(skill, text, claudePrompt);
      const friendlyTitle = skillDisplayTitle(skill);

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
        // The send's turn stream pushes the user bubble into the
        // conversation VM itself — no app-side optimistic push.
        await tauriChat.send(path, encodedWithAttachments, sessionKey, {
          mode: mode?.promptFile,
          // The wire pin must match the picker. In Teams this may be the open
          // mission's pin rather than the agent's effective default.
          providerOverride: displayModelPin.provider,
          modelOverride: displayModelPin.model,
          effortOverride: displayModelPin.effort,
          modeOverride: turnMode,
          // A Skill send still carries whatever the user typed alongside it, so
          // the teammates they named there must ride too (HOU-944).
          mentions,
        });
        // Landed, so the turn is starting: an ARCHIVED mission has just been
        // re-activated by it, exactly as an interaction offer would. A throw
        // above skips this and propagates to the composer's own error path.
        // (Only this branch — the `else` CREATES a mission, which is never
        // archived, and `onSelectSession` already moves the user to it.)
        onSendReactivatedRef.current?.();
      } else {
        // New conversation: createMission with `title` override so the
        // kanban card reads "Research a company" instead of the marker.
        const agentMode = agentModes?.[0]?.id;
        const mode = agentModes?.find((m) => m.id === agentMode);

        const { conversationId } = await createMission(
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
            providerOverride: displayModelPin.provider,
            modelOverride: displayModelPin.model,
            effortOverride: displayModelPin.effort,
            modeOverride: turnMode,
            mentions,
            buildPrompt: async (activityId) => {
              const paths = await tauriAttachments.save(
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
          },
        );
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
      displayModelPin,
      turnMode,
      queryClient,
    ],
  );

  // Picking a skill from a card or the picker pins it above the regular
  // composer. The user can add text or send the Skill by itself.
  const applySkill = useCallback(
    (skill: SkillSummary) => setActiveSkill(skill),
    [],
  );

  // ── Integration connect card support (HOU-670) ───────────────────────
  // The card owns its own connection status (it subscribes to the shared
  // integration queries directly so it stays reactive inside Streamdown's
  // memoized markdown blocks). The panel only supplies the agent nudge.
  //
  // When a connection the user started from a chat card lands, proactively
  // nudge the agent so it resumes the task without the user having to
  // retype. The agent needs a user turn to resume, but the user didn't type
  // one — tag it with the auto-continue marker so the agent still receives
  // the instruction while the transcript hides the bubble (see
  // `mapFeedItems`). No optimistic push: we never want it shown, and the
  // engine-persisted copy is filtered the same way on reload.
  const handleIntegrationConnected = useCallback(
    (_toolkit: string, appName: string) => {
      if (!path || !selectedSessionKey) return;
      const message = encodeAutoContinueMessage(
        t("chat:composio.connectedFollowup", { name: appName }),
      );
      tauriChat
        .send(path, message, selectedSessionKey, {
          providerOverride: displayModelPin.provider,
          modelOverride: displayModelPin.model,
          effortOverride: displayModelPin.effort,
          modeOverride: turnMode,
        })
        // Two-arg `then`, not `.then().catch()`: the rejection handler stays
        // exclusive to the SEND, so a throw inside the handoff callback is
        // never reported as a failed follow-up.
        .then(
          // The nudge starts a turn, so an ARCHIVED mission has just been
          // re-activated by it — move the user with it (`useArchivedHandoff`),
          // exactly as the interaction sends do.
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
    [path, selectedSessionKey, displayModelPin, turnMode, addToast, t],
  );
  const renderLink = useCallback<NonNullable<AIBoardProps["renderLink"]>>(
    ({ href }) => {
      if (!integrationsEnabled || !agent) return undefined;
      const toolkit = parseToolkitFromHref(href);
      if (!toolkit) return undefined;
      return (
        <IntegrationConnectCard
          toolkit={toolkit}
          agentId={agent.id}
          onConnected={handleIntegrationConnected}
        />
      );
    },
    [integrationsEnabled, agent, handleIntegrationConnected],
  );

  // ── Pending-interaction override (ask_user / request_connection) ──────
  // The one thing the mission is waiting on the user for: the live VM
  // interaction if this client settled the turn, else the activity's persisted
  // one (reload / observer). Gated on `running` so a fresh turn's composer wins
  // and the card disappears the instant the user answers, and on the mission's
  // board status so a card the user moved to Done shows the clean-finish offers
  // and never a blocking stepper — the same strip the write seams persist, so
  // the live view and a reload agree.
  //
  // Memoized because the Done strip can mint a new object: the override memo
  // below keeps the stepper's in-progress outcomes in its body and must not
  // recompute on an unrelated render.
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

  // A stable key for the CURRENT pending interaction. There is no single id on a
  // PendingInteraction (only on its individual steps), so the step ids joined in
  // order identify one sequence — enough to remember "the user abandoned THIS
  // interaction" across renders without re-showing it.
  const interactionKey =
    activeInteraction?.steps.map((s) => s.id).join(",") ?? null;

  // Sends the composed interaction reply as a normal user message through the
  // existing follow-up send path; the turn start clears the interaction, so the
  // card retires through the same reactivity. A failure surfaces (no silent
  // swallow) — the composer is gone, so a toast is the only channel left.
  //
  // This is the ONE send every interaction card routes through (stepper
  // completion, suggested-action bubble, save-as-reusable, plan-ready), so all
  // four report through `onSendReactivated` from here. It is not the only send
  // this hook owns, and EVERY one of them reports: the Skill submit above, the
  // integration-connected nudge, and the two error-card retries in
  // `renderSystemMessage` each fire the callback from their own await/handler.
  // A send that starts a turn re-activates an archived mission, so a send that
  // stays silent strands the user on a list the conversation just left.
  //
  // `mode` overrides the composer's pinned Mode for the one send: a suggested
  // follow-up action asks the agent to DO the thing, so it runs in `execute`
  // like the save-as-reusable send, never in plan. Omitted → the pinned mode
  // (an answered question resumes the turn the user was already having).
  const sendInteractionMessage = useCallback(
    (text: string, mode?: TurnMode) => {
      if (!path || !selectedSessionKey) return;
      tauriChat
        .send(path, text, selectedSessionKey, {
          providerOverride: displayModelPin.provider,
          modelOverride: displayModelPin.model,
          effortOverride: displayModelPin.effort,
          modeOverride: mode ?? turnMode,
        })
        // Two-arg `then`, not `.then().catch()`: the rejection handler must stay
        // exclusive to the SEND, or a throw inside the handoff callback would
        // be reported to the user as a failed message.
        .then(
          () => onSendReactivatedRef.current?.(),
          (err: unknown) => {
            addToast({
              title: t("chat:errors.sessionStart", { error: String(err) }),
              variant: "error",
            });
          },
        );
    },
    [path, selectedSessionKey, displayModelPin, turnMode, addToast, t],
  );

  // Resolves a question step's `toolkit` to the app's presentational brand (logo
  // + name) so a question that concerns an integration wears the app's identity
  // in its title. Read-only (no connect side effects); a catalog miss yields the
  // prettified slug and no logo. Stable across renders unless the catalog moves.
  const resolveBrand = useToolkitBrandResolver();

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
      progress: (current: number, total: number) =>
        t("chat:questionCard.progress", { current, total }),
    }),
    [t],
  );

  // ── Plan-ready override (plan_ready) ──────────────────────────────────
  // When the model finishes planning it calls `plan_ready`, arriving as a lone
  // `{kind:"plan_ready", summary}` step (like ask_user). The card offers two
  // ways forward; its dismiss X retires it LOCALLY (composer returns, mode
  // stays plan) by remembering THIS plan's summary. A later, different plan
  // re-shows the card. The dismissal is per-conversation, so it resets when the
  // open session changes or a new turn starts.
  const [dismissedPlanReady, setDismissedPlanReady] = useState<string | null>(
    null,
  );
  // The optional "save as reusable" offer (suggest_reusable) is dismissed
  // LOCALLY by id when the user picks "Not now" (or acts on Save), so the card
  // doesn't reappear for that same offer. Per-conversation, like plan-ready.
  const [dismissedSuggestReusable, setDismissedSuggestReusable] = useState<
    string | null
  >(null);
  const [dismissedSuggestActions, setDismissedSuggestActions] = useState<
    string | null
  >(null);
  // The user can abandon any pending interaction by its dismiss X, or an
  // above-card offer by typing a fresh composer message. Remembering the
  // interaction key suppresses its card uniformly until the next turn starts.
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
  // A running turn has already null-cleared the prior pending interaction in
  // the engine. Reset local suppression at its start so a later offer belongs
  // to this turn, not to an earlier plan or suggestion with a reused step id.
  useEffect(() => {
    if (!turnRunning) return;
    setDismissedPlanReady(null);
    setDismissedSuggestReusable(null);
    setDismissedSuggestActions(null);
    setAbandonedInteractionKey(null);
  }, [turnRunning]);

  // Writes to the open mission's PERSISTED pending interaction, so a dismissed
  // card never reappears on reload: a blanket clear for the interrupt
  // (dismissActiveInteraction, with a stop marker) and a per-step drop for the
  // independent clean-finish offers (dismissing the bubbles must not take the
  // save-as-reusable card with them). Both persist, then repaint the board +
  // transcript — see `use-persisted-interaction.ts`.
  const { clearPersistedInteraction, dismissInteractionStep } =
    usePersistedInteraction({
      agentPath: path,
      activityId: selectedActivityId,
      sessionKey: selectedSessionKey,
    });

  // The stepper's X on ANY step kind (question/signin/connect/credential): "the
  // user interrupted, nothing was decided" — exactly a Stop. Hide the card at
  // once (the abandoned-key suppresses it), append the durable stop marker on the
  // runtime (its own toast on failure via `call()`; swallow the re-throw so the
  // clear still runs), then clear the persisted interaction + repaint. The model
  // learns nothing from an interrupt, deliberately.
  const dismissActiveInteraction = useCallback(() => {
    if (!path || !selectedSessionKey || !interactionKey) return;
    setAbandonedInteractionKey(interactionKey);
    void (async () => {
      // The marker surfaces its own failure through `call()`; swallow the
      // re-throw so a failed marker never blocks clearing the persisted card.
      await tauriChat
        .dismissInteraction(path, selectedSessionKey)
        .catch(() => {});
      await clearPersistedInteraction();
    })();
  }, [path, selectedSessionKey, interactionKey, clearPersistedInteraction]);

  // Start a turn from the plan-ready card: flip the composer's Mode pill (and
  // persist it) to the chosen mode, then send the confirming message with an
  // EXPLICIT `modeOverride` — never the async `turnMode` state, which the pill
  // flip has not yet committed. The user's message bubble is visible (no
  // suppress flags): the plan approval is a real user turn.
  const startPlan = useCallback(
    (mode: TurnMode, text: string) => {
      // No path / session guard here: `sendInteractionMessage` owns that check,
      // and the card only renders on an open conversation anyway.
      void handleModeSelect(mode);
      sendInteractionMessage(text, mode);
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

  // ── Suggest-reusable offer (suggest_reusable) ─────────────────────────
  // On a clean finish the model may call `suggest_reusable`, arriving as a lone
  // `{kind:"suggest_reusable", ...}` step. The card offers to save the work as a
  // Skill, Routine, or Learning. "Save" sends a follow-up message asking the agent
  // to actually WRITE the Skill/Routine/Learning, so it always runs in `execute` mode
  // regardless of the composer's pinned mode (planning it is not enough), and it
  // does NOT flip the composer's Mode pill (this is a one-off follow-up, not a
  // change to the ongoing mode). It dismisses the offer locally first so the
  // card can't fire twice.
  const suggestReusableLabels = useMemo<ChatSuggestReusableLabels>(
    () => ({
      eyebrow: t("chat:suggestReusable.title"),
      skillTitle: t("chat:suggestReusable.skillTitle"),
      routineTitle: t("chat:suggestReusable.routineTitle"),
      learningTitle: t("chat:suggestReusable.learningTitle"),
      // The unified card-family decline word, shared with the interaction card.
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

  const saveReusable = useCallback(
    (step: SuggestReusableStep) => {
      // No path / session guard here: `sendInteractionMessage` owns that check.
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
      sendInteractionMessage(text, "execute");
    },
    [sendInteractionMessage, t],
  );

  // The mission is waiting on a sequence of steps (questions then connections).
  // ONE ChatInteractionCard walks them one at a time; `onComplete` fires after
  // the LAST step, never before, so the card lives until every connection has
  // landed.
  //
  // Completion composes ONE reply: `"<question>: <answer>"` per answered
  // question, then `"Connected <app>."` per connection that landed. A sequence
  // with questions sends that reply visibly (the user typed those answers). A
  // connect-ONLY sequence has no user-typed text, so it sends the SAME reply as
  // a hidden auto-continue message: the agent resumes without a fake user
  // bubble in the transcript. The reply fires ONCE at completion; firing it
  // per-connect would start a turn that tore the card down before later connect
  // steps could complete.
  //
  // `connectedNames` accumulates the display names of connections made during
  // THIS sequence. It lives in the memo body (not a ref) because
  // `deriveActiveInteraction` returns a STABLE reference for a given pending
  // interaction, so the memo does not recompute — and the accumulator does not
  // reset — while the user walks the steps; a fresh interaction gets a fresh
  // array.
  // The stepper and plan_ready REPLACE the composer: each owns the one text
  // input on screen. The suggestion offers stay above the composer because they
  // carry no text input. `node: undefined` means the composer stands alone.
  const composerOverrideState = useMemo<{
    node: AIBoardProps["composerOverride"];
    mode: "above" | "replace";
  }>(() => {
    const none = { node: undefined, mode: "above" as const };
    // No AI model connected wins over everything: there is no provider to run a
    // stepper's turn or a plan against either, so the connect CTA is the only
    // thing the composer slot can honestly offer.
    if (connectAiComposer.node)
      return { mode: "replace" as const, node: connectAiComposer.node };
    // The missions THIS chat started (PRODUCT-1244). A coordinating chat's most
    // useful "what next" is its own children, so the list REPLACES the generic
    // follow-up bubbles — but never a BLOCKING step: an unanswered question
    // still owns the composer below.
    const missionsNode = childMissions.length ? (
      <ChatMissionList
        labels={missionListLabels}
        missions={childMissions}
        onOpen={(id) => onOpenChildMission?.(id)}
      />
    ) : null;
    if (!agent || !activeInteraction)
      return missionsNode
        ? { mode: "above" as const, node: missionsNode }
        : none;
    // Abandoned interactions stay suppressed while this conversation is open,
    // whatever their kind, and the composer stands alone.
    if (interactionKey === abandonedInteractionKey) return none;
    // Optional clean-finish offers can coexist. They are handled before the
    // blocking stepper so action bubbles and the reusable card remain above the
    // live composer, while any blocking step still wins on the runtime side.
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
            {/* The children list stands in for the follow-up bubbles: on a
                coordinating chat the concrete next step is reviewing what it
                started, not a generic prompt. The save-as-reusable offer is a
                different kind of offer and still rides below. */}
            {missionsNode}
            {actions.kind === "bubbles" && !missionsNode ? (
              <ChatSuggestActions
                actions={actions.step.actions}
                labels={suggestActionsLabels}
                // Per-STEP dismissal: drop only this offer from the persisted
                // interaction, so the sibling save-as-reusable card is still
                // there after a reload.
                onDismiss={() => {
                  setDismissedSuggestActions(actions.step.id);
                  void dismissInteractionStep(
                    activeInteraction,
                    actions.step.id,
                  );
                }}
                onSelect={(action) => {
                  // HOU-1050: a pill click PREFILLS the composer instead of
                  // sending, so the user can edit the prompt (or pick another
                  // pill — each click replaces the draft) before deciding to
                  // send. The pills stay up until the actual send abandons the
                  // interaction (onComposerSubmit) or the X dismisses it.
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
    // A lone plan_ready step becomes the plan-ready card (unless dismissed);
    // everything else feeds the stepper over its plan_ready-free steps.
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
            // No abandon bookkeeping: the turn start null-clears the pending
            // interaction and deriveActiveInteraction hides the card while the
            // turn runs. Keying the conversation-wide abandoned key here would
            // suppress EVERY later plan card (each plan_ready step is id "p1").
            onSubmit={(text) => startPlan("plan", text)}
          />
        ),
      };
    }
    // Map the protocol steps into ui/chat steps, resolving each question step's
    // optional `toolkit` into a presentational brand (logo + name) so a question
    // that concerns an integration wears the app's identity in its title. A step
    // with no toolkit passes through unbranded; a catalog miss keeps the question
    // plain-titled with a prettified name and no logo — never a crash.
    const steps: ChatInteractionStep[] = override.steps.map((step) =>
      step.kind === "question" && step.toolkit
        ? { ...step, brand: resolveBrand(step.toolkit) }
        : step,
    );
    const hasQuestionSteps = steps.some((step) => step.kind === "question");
    // A completed sequence has walked EVERY step, but a signin/connect step may
    // have been SKIPPED — a fact the agent must hear (or it re-asks forever) —
    // OR skipped then RECONSIDERED (walked Back and connected/signed in after
    // all). The reply must reflect FINAL state, never a stale skip line. So the
    // accounting derives from a per-step outcome recorded IN PLACE as the user
    // acts: a later connect overwrites an earlier skip for the same step. These
    // live in the memo body (not refs) because `deriveActiveInteraction`
    // returns a STABLE reference for a given pending interaction, so the memo
    // doesn't recompute — and the outcomes don't reset — while the user walks
    // the steps; a fresh interaction starts clean.
    const connectOutcomes = new Map<string, ConnectOutcome>();
    let signinOutcome: "pending" | "signedIn" | "skipped" = "pending";
    // The user's typed "do this instead" text on a declined sign-in step (the
    // free-text row), relayed to the agent so it hears the redirection. Lives in
    // the memo body like the outcome maps; a fresh interaction starts clean.
    let signinDeclineText: string | undefined;
    // Per credential step's FINAL outcome (saved wins over an earlier skip),
    // recorded in place as the user acts — the credential mirror of
    // `connectOutcomes`. Folded into the ONE composed reply below so a credential
    // step resumes the agent exactly like a connect: a saved key names "Added
    // the X key.", a declined one "Skipped adding the X key." (a fact the agent
    // MUST hear, or it waits on a key that never comes).
    const credentialOutcomes = new Map<string, CredentialOutcome>();
    // How each credentialed integration authenticates (keyed by NAME, the unit
    // the composed lines speak in): a sign-in (oauth) step reads "Signed in to
    // X." / "Skipped signing in to X." instead of the key wording — the agent
    // narrates whichever fact actually happened (PRODUCT-1172).
    const credentialModes = new Map<string, "key" | "oauth">();
    return {
      mode: "replace",
      node: (
        <ChatInteractionCard
          steps={steps}
          labels={interactionLabels}
          onDismiss={dismissActiveInteraction}
          onComplete={(answers: ChatInteractionAnswer[]) => {
            // ONE send after the LAST step: a sequence with questions replies with
            // the user's visible answers; a signin/connect/credential-only
            // sequence resumes the agent with a hidden auto-continue message (no
            // fake user bubble). The visible reply also carries a structured
            // marker so the transcript renders the answers as a Q&A card.
            //
            // Derive the connected/skipped lines from each step's FINAL outcome,
            // in step order — a step skipped then reconsidered reports "Connected"
            // (never a stale "Skipped ..."), and no step is ever named twice.
            const { connectedNames, skippedConnectNames, connectRedirects } =
              finalConnectNames(
                steps.filter((s) => s.kind === "connect").map((s) => s.id),
                connectOutcomes,
              );
            // Credential outcomes mirror connects: saved keys name "Added the X
            // key.", declined ones "Skipped adding the X key." — FINAL state, so a
            // key skipped then reconsidered reports saved, never a stale skip.
            const {
              credentialedNames,
              skippedCredentialNames,
              credentialRedirects,
            } = finalCredentialNames(
              steps.filter((s) => s.kind === "credential").map((s) => s.id),
              credentialOutcomes,
            );
            sendInteractionMessage(
              encodeInteractionAnswersMessage({
                answers,
                connectedNames,
                skippedConnectNames,
                credentialedNames,
                skippedCredentialNames,
                connectRedirects,
                credentialRedirects,
                signinDeclineText,
                hasQuestionSteps,
                signedIn: signinOutcome === "signedIn",
                signinSkipped: signinOutcome === "skipped",
                connectedLine: (name) =>
                  t("chat:interaction.connectedLine", { name }),
                skippedConnectLine: (name) =>
                  t("chat:interaction.skippedConnectLine", { name }),
                connectRedirectLine: (name, text) =>
                  t("chat:interaction.connectRedirectLine", { name, text }),
                credentialedLine: (name) =>
                  t(
                    credentialModes.get(name) === "oauth"
                      ? "chat:credential.signedInLine"
                      : "chat:credential.savedLine",
                    { name },
                  ),
                skippedCredentialLine: (name) =>
                  t(
                    credentialModes.get(name) === "oauth"
                      ? "chat:credential.skippedSignInLine"
                      : "chat:credential.skippedLine",
                    { name },
                  ),
                credentialRedirectLine: (name, text) =>
                  t(
                    credentialModes.get(name) === "oauth"
                      ? "chat:credential.signInRedirectLine"
                      : "chat:credential.redirectLine",
                    { name, text },
                  ),
                signedInLine: t("chat:interaction.signedInLine"),
                skippedSigninLine: t("chat:interaction.skippedSigninLine"),
                signinRedirectLine: (text) =>
                  t("chat:interaction.signinRedirectLine", { text }),
                signedInFollowup: t("chat:interaction.signedInFollowup"),
                credentialedFollowup: t(
                  credentialedNames.length > 0 &&
                    credentialedNames.every(
                      (n) => credentialModes.get(n) === "oauth",
                    )
                    ? "chat:credential.signedInFollowup"
                    : "chat:credential.savedFollowup",
                  { name: credentialedNames.join(", ") },
                ),
              }),
            );
          }}
          renderSignin={(step, api) => (
            <ChatSigninInteractionCard
              key={step.id}
              stepId={step.id}
              pager={api.pager}
              onDismiss={api.onDismiss}
              dismissLabel={api.dismissLabel}
              collapseLabel={api.collapseLabel}
              expandLabel={api.expandLabel}
              disabled={api.disabled}
              open={api.open}
              onOpenChange={api.onOpenChange}
              reason={step.reason}
              revisited={api.revisited}
              onSignedIn={() => {
                // Record the FINAL state (signed in wins over any earlier skip)
                // and advance ONLY — the composed reply fires at completion.
                signinOutcome = "signedIn";
                api.onSignedIn();
              }}
              onSkip={(message) => {
                // Record the decline (and the typed "do this instead" text, if
                // any) and advance ONLY — same one-send rule as connects: the
                // composed reply fires at completion. A message makes the sequence
                // resume visibly so the agent (and the transcript) hears it.
                signinOutcome = "skipped";
                signinDeclineText = message;
                api.onSkip();
              }}
            />
          )}
          renderConnect={(step, api) => (
            <ChatConnectInteractionCard
              key={step.id}
              stepId={step.id}
              pager={api.pager}
              onDismiss={api.onDismiss}
              dismissLabel={api.dismissLabel}
              collapseLabel={api.collapseLabel}
              expandLabel={api.expandLabel}
              disabled={api.disabled}
              open={api.open}
              onOpenChange={api.onOpenChange}
              agentId={agent.id}
              reason={step.reason}
              revisited={api.revisited}
              onConnected={(_toolkit, appName) => {
                // Record the app's FINAL outcome (connected wins over any earlier
                // skip for this step) and advance ONLY. The composed `onComplete`
                // reply resumes the agent once EVERY step is done; starting a turn
                // here would tear the card down before later connect steps could
                // complete.
                connectOutcomes.set(step.id, {
                  name: appName,
                  connected: true,
                });
                api.onConnected();
              }}
              onSkip={(_toolkit, appName, message) => {
                // Record the decline (and the typed "do this instead" text, if
                // any) and advance ONLY (one send at completion). A message makes
                // the sequence resume visibly so the agent hears the redirection.
                connectOutcomes.set(step.id, {
                  name: appName,
                  connected: false,
                  message,
                });
                api.onSkip();
              }}
              toolkit={step.toolkit}
            />
          )}
          renderCredential={(step, api) => (
            <ChatCredentialInteractionCard
              key={step.id}
              stepId={step.id}
              agentId={agent.id}
              pager={api.pager}
              onDismiss={api.onDismiss}
              dismissLabel={api.dismissLabel}
              collapseLabel={api.collapseLabel}
              expandLabel={api.expandLabel}
              disabled={api.disabled}
              open={api.open}
              onOpenChange={api.onOpenChange}
              toolkit={step.toolkit}
              reason={step.reason}
              revisited={api.revisited}
              onSaved={(name, mode) => {
                // Record the FINAL outcome (saved wins over any earlier skip for
                // this step) and advance ONLY. The composed `onComplete` reply
                // resumes the agent once EVERY step is done, mirroring connect.
                credentialModes.set(name, mode);
                credentialOutcomes.set(step.id, { name, saved: true });
                api.onSaved();
              }}
              onSkip={(name, mode, message) => {
                // Record the decline (and the typed "do this instead" text, if
                // any) and advance ONLY (one send at completion) — the agent hears
                // "Skipped adding the X key." (or the sign-in/redirect variant)
                // so it stops waiting. A message makes the sequence resume
                // visibly.
                credentialModes.set(name, mode);
                credentialOutcomes.set(step.id, {
                  name,
                  saved: false,
                  message,
                });
                api.onSkip();
              }}
            />
          )}
        />
      ),
    };
  }, [
    connectAiComposer.node,
    agent,
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
    childMissions,
    onOpenChildMission,
    startPlan,
    saveReusable,
    interactionLabels,
    sendInteractionMessage,
    draftKey,
    dismissInteractionStep,
    dismissActiveInteraction,
    resolveBrand,
    t,
  ]);
  const composerOverride = composerOverrideState.node;
  const composerOverrideMode = composerOverrideState.mode;
  // The archived surfaces take only the offers — the mode IS the distinction:
  // "above" is the offers-beside-a-live-composer shape (and the nothing-pending
  // shape, whose node is undefined anyway), "replace" is a blocking stepper or
  // the plan-ready card.
  const offersComposerOverride =
    composerOverrideMode === "above" ? composerOverride : undefined;

  // A fresh composer message while an above-card shows abandons that interaction
  // and runs the usual submit path. Replacing cards submit through their own
  // controls, so completing an interaction never self-abandons it.
  const onComposerSubmit = useCallback<
    NonNullable<AIBoardProps["onComposerSubmit"]>
  >(
    (ctx) => {
      if (activeInteraction && interactionKey !== abandonedInteractionKey)
        setAbandonedInteractionKey(interactionKey);
      return handleSkillComposerSubmit(ctx);
    },
    [
      handleSkillComposerSubmit,
      activeInteraction,
      interactionKey,
      abandonedInteractionKey,
    ],
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
    [attachmentLabels],
  );
  // What an UNLABELED provider-error card may be attributed to: evidence
  // only, never the composer's "anthropic" last resort — a guessed label sends
  // the user to the wrong sign-in (OpenAI users were told to "Connect
  // Anthropic"). No evidence leaves the card generic.
  const cardProvider = errorCardProvider({
    activityProvider,
    agentProvider,
    lastUsedProvider,
  });
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
                providerOverride: displayModelPin.provider,
                modelOverride: displayModelPin.model,
                effortOverride: displayModelPin.effort,
                modeOverride: turnMode,
              });
              // The retry starts a turn: this card also renders inside an
              // ARCHIVED transcript, and the send re-activates that mission, so
              // the user has to travel with it. A throw above skips this and
              // surfaces through the card's own error path.
              onSendReactivatedRef.current?.();
            }}
            onSwitchModel={
              isModelUnsupported
                ? () => selectModel("openai", "gpt-5.5")
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
        // The not-connected card arrives provider-less (the refusal can't name
        // one — nothing was connected); label it only from evidence of what
        // this chat actually used, so its reconnect flow targets that provider
        // and never a guessed one.
        const providerError = resolveProviderErrorForChat(
          msg.providerError,
          cardProvider,
        );
        return (
          <ProviderErrorCard
            error={providerError}
            onRetry={async () => {
              if (!path || !selectedSessionKey) return;
              // A refused not-connected send never reached the engine —
              // the card resends the original message verbatim. A mid-turn
              // auth failure's context is already server-side, so reconnect
              // resumes the interrupted task with a hidden auto-continue
              // nudge (the transcript filters its bubble, see
              // `mapFeedItems`). Both fire automatically on reconnect;
              // other failures keep the generic visible retry prompt.
              const continues = continuesTaskAfterReconnect(providerError);
              const continueText = reconnectContinueText(
                providerError,
                t("chat:providerError.reconnectedContinue"),
              );
              const text = continues
                ? encodeAutoContinueMessage(continueText)
                : providerErrorRetryText(
                    providerError,
                    t("chat:toolRuntimeError.retryPrompt"),
                  );
              // The reconnect resume fires WITHOUT the user typing, so it is an
              // `autoResume` send: if the conversation shows a running turn it
              // is held at most once (several mounted cards can fire the same
              // resume), dropped when redundant, and held INVISIBLY — no
              // queued bubble; the adapter's watchdog probes immediately so a
              // stale hold clears within one round-trip (HOU-849).
              await tauriChat.send(path, text, selectedSessionKey, {
                providerOverride: displayModelPin.provider,
                modelOverride: displayModelPin.model,
                effortOverride: displayModelPin.effort,
                modeOverride: turnMode,
                // A refused not-connected send left its prompt's bubble in
                // the feed already — resending it must not add a second one.
                suppressUserBubble: resendsOriginalPrompt(providerError),
                autoResume: providerError.kind === "unauthenticated",
              });
              // Same as the tool-error retry: this card renders inside archived
              // transcripts too, and the send re-activates the mission.
              onSendReactivatedRef.current?.();
            }}
            // "Pick another model" pops the MODEL picker (not the Skills picker);
            // "Switch to <fallback>" applies it directly on the same provider.
            onSwitchModel={() => setModelPickerOpen(true)}
            onApplyModel={(model) =>
              selectModel(displayModelPin.provider, model)
            }
          />
        );
      }
      if (isProviderAuthMessage(msg.content)) return null;
      return undefined;
    },
    [
      displayModelPin,
      cardProvider,
      turnMode,
      selectModel,
      path,
      selectedSessionKey,
      t,
    ],
  );
  // The welcome chat's greeting (HOU-713): a hardcoded, localized agent
  // message derived from the `welcome-` session key — prepended at render
  // time (it survives reloads for free), held back for a short beat on the
  // run that created the mission.
  const welcomeGreetingRevealed =
    useWelcomeGreetingRevealed(selectedSessionKey);
  const agentName = agent?.name;
  // The setup mission's instant hello (HOU-867): derived while the pod warms
  // up, dropped the moment the agent's own first output arrives.
  const setupGreetingName = useSetupGreetingName(path, selectedSessionKey);
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
      if (
        setupGreetingName &&
        sessionKey === selectedSessionKey &&
        !hasAgentOutput(mapped)
      ) {
        const hello: FeedItem = {
          feed_type: "assistant_text",
          data: t("chat:setupGreeting.text", { name: setupGreetingName }),
        };
        // After the kickoff bubble — it reads as the agent's first reply.
        return [...mapped, hello];
      }
      return mapped;
    },
    [
      welcomeGreetingRevealed,
      agentName,
      setupGreetingName,
      selectedSessionKey,
      t,
    ],
  );
  const afterMessages = useCallback(
    ({ feedItems }: { sessionKey: string; feedItems: FeedItem[] }) => {
      // A message sent while the agent's engine still warms up (HOU-693) is
      // narrated by the standard in-flight indicator — deriveStatus treats
      // the parked trailing user bubble as "submitted" (HOU-713).
      // The persisted inline `UnauthenticatedCard` (a provider_error feed item)
      // is the stable reconnect surface. When one is present, don't also
      // render the store-driven card — it flickers (auto-dismisses) when the
      // provider's auth probe is unreliable, and when the chat-provider
      // resolution disagrees with the provider the turn ACTUALLY failed on
      // (a stale activity record) it would name the wrong provider outright.
      // One card per chat, and the inline one carries the true provider.
      const hasInlineAuthCard = feedItems.some(isInlineAuthCard);
      if (hasInlineAuthCard) return null;
      // The connect-AI empty state already owns the one "connect a model" CTA
      // for this chat, and it says the truer thing (nothing is connected at
      // all, versus this provider needs reconnecting). Two CTAs stacked would
      // just make the user choose between them. Inline historical
      // provider-error cards in the transcript are untouched — they are a
      // record of what happened, not an action.
      if (connectAiComposer.active) return null;
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
    [effectiveProvider, connectAiComposer.active],
  );

  // Shared-agent clarity (contract §6): when the agent is shared with more than
  // one teammate, everyone with access sees this same conversation. Surface a
  // subtle note above the composer so a teammate isn't surprised their reply is
  // visible to others. Multiplayer-only; the assignee count is only populated
  // for callers who receive it (owner / agent-managers).
  const composerHeader = useMemo<AIBoardProps["composerHeader"]>(() => {
    if (!agent) return undefined;
    if (!activeSkill) return undefined;
    return (
      <div className="flex flex-col gap-1.5">
        <SelectedSkillChip
          skill={activeSkill}
          onCancel={() => setActiveSkill(null)}
        />
      </div>
    );
  }, [agent, activeSkill]);

  const chatEmptyState = useMemo<AIBoardProps["chatEmptyState"]>(() => {
    if (!agent) return undefined;
    // The welcome chat is only "empty" for the pre-greeting beat — skill
    // cards flashing there and vanishing under the greeting reads as a bug.
    if (isWelcomeSessionKey(selectedSessionKey)) return undefined;
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
  ]);

  const footer = useMemo<AIBoardProps["footer"]>(() => {
    if (!agent) return undefined;
    return () => (
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium text-ink-muted hover:text-ink hover:bg-hover transition-colors"
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
    return ({ openFilePicker, openFolderPicker }) => (
      <div className="flex flex-col gap-0.5">
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
      <DictationSetupDialog modelSetup={modelSetup} />
    </>
  ) : null;

  return {
    chatEmptyState,
    composerHeader,
    composerOverride,
    composerOverrideMode,
    offersComposerOverride,
    canSendEmpty: activeSkill != null,
    onComposerSubmit,
    footer,
    attachMenu,
    renderUserMessage,
    renderLink,
    isSpecialTool,
    renderToolResult,
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    renderTurnSummary,
    renderSystemMessage,
    conversationMap,
    mapFeedItems,
    afterMessages,
    pickerDialog,
    effectiveProvider: displayModelPin.provider,
    effectiveModel: displayModelPin.model,
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
