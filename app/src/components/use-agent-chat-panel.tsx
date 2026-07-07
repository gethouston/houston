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
  type ChatInteractionAnswer,
  ChatInteractionCard,
  decodeAttachmentMessage,
  UserAttachmentMessage,
  type UserAttachmentMessageLabels,
} from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, Play, Users } from "lucide-react";
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
  useSetAgentModelChoice,
  useSkills,
} from "../hooks/queries";
import { useCapabilities } from "../hooks/use-capabilities";
import {
  useConversationFeed,
  useConversationVm,
} from "../hooks/use-conversation-vm";
import { useFileToolRenderer } from "../hooks/use-file-tool-renderer";
import { useProviderStatuses } from "../hooks/use-provider-statuses";
import { useSession } from "../hooks/use-session";
import { useStoreSkillLocaleMigration } from "../hooks/use-store-skill-locale-migration";
import { deriveActiveInteraction } from "../lib/active-interaction";
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
import { skillDisplayTitle } from "../lib/humanize-skill-name";
import { composeInteractionReply } from "../lib/interaction-reply";
import {
  modelSelectorDecision,
  resolvePersonalModelPin,
} from "../lib/model-selector-lock";
import { canManageAgentGrants, isMultiplayer } from "../lib/org-roles";
import { osIsTauri } from "../lib/os-bridge";
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
import { normalizeTurnMode, type TurnMode } from "../lib/turn-mode";
import type { Agent, AgentDefinition, SkillSummary } from "../lib/types";
import { useDraftStore } from "../stores/drafts";
import { useUIStore } from "../stores/ui";
import { ChatConnectInteractionCard } from "./chat-connect-interaction-card";
import { resolveEffectiveProvider } from "./chat-effective-provider";
import { ChatEffortSelector } from "./chat-effort-selector";
import { ChatModeSelector } from "./chat-mode-selector";
import { ChatModelSelector } from "./chat-model-selector";
import { ContextCompactedDivider } from "./context-compacted-divider";
import { ContextIndicator } from "./context-indicator";
import { DictationSetupDialog } from "./dictation-setup-dialog";
import { IntegrationConnectCard } from "./integration-connect-card";
import { parseToolkitFromHref } from "./integration-connect-card-state";
import { integrationsSupported } from "./integrations/model";
import { NewMissionPickerDialog } from "./new-mission-picker-dialog";
import { ProviderSwitchDialog } from "./provider-switch-dialog";
import { SelectedSkillChip } from "./selected-skill-chip";
import { AgentProvisioningCard } from "./shell/agent-provisioning-card";
import { ProviderErrorCard } from "./shell/provider-error-card";
import {
  isInlineAuthCardForChat,
  providerErrorRetryText,
  resendsOriginalPrompt,
  resolveProviderErrorForChat,
} from "./shell/provider-error-cards/not-connected";
import { ProviderReconnectCard } from "./shell/provider-reconnect-card";
import { ToolRuntimeErrorCard } from "./shell/tool-runtime-error-card";
import { SkillCard } from "./skill-card";
import { isSharedWithOthers } from "./tabs/agent-access-model";
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
  /** Replaces the whole composer with the interaction card (ask_user /
   *  request_connection) when the mission is waiting on the user. Undefined
   *  when nothing is pending or a turn is running. */
  composerOverride: AIBoardProps["composerOverride"];
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
  loadingIndicator: ChatPanelProps["loadingIndicator"];
  renderTurnSummary: ChatPanelProps["renderTurnSummary"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  mapFeedItems: AIBoardProps["mapFeedItems"];
  afterMessages: AIBoardProps["afterMessages"];
  /** Hidden picker dialog mounted in the consumer. */
  pickerDialog: ReactNode;
  /** Effective provider/model for sending. */
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
  /** Prop-driven dictation control for the composer mic. Undefined on web
   *  (no native mic capture) — ChatPanel hides the mic entirely. */
  dictation: ChatPanelProps["dictation"];
}

export function useAgentChatPanel({
  agent,
  agentDef,
  selectedSessionKey,
  onSelectSession,
}: UseAgentChatPanelArgs): AgentChatPanelProps {
  const { t, i18n } = useTranslation(["board", "chat", "teams"]);
  const {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    loadingIndicator,
  } = useChatDisplayLabels();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  // Multiplayer attribution (C5): the signed-in viewer's id lets ChatPanel tell
  // the viewer's own bubbles from teammates'. Undefined signed out / local.
  const { data: session } = useSession();
  const currentUserId = session?.user.id;
  const authorLabels = undefined;

  // ── Dictation (desktop-only voice typing) ──────────────────────────────
  // Transcript text is appended to the SAME draft store AIBoard's
  // `drafts`/`onDraftChange` read from (`useBoardDrafts` in mission-board.tsx)
  // — the key mirrors AIBoard's own `activeSessionKey ?? "new-conversation"`
  // derivation, so dictating into a fresh composer lands in the same draft
  // the user would see if they typed instead.
  const draftKey = selectedSessionKey ?? "new-conversation";
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
  // Composer "Mode" pin (execute/plan). Loaded from config as memory only; the
  // send path forwards it as `modeOverride`. Unknown/legacy values → execute.
  const [turnMode, setTurnMode] = useState<TurnMode>("execute");
  useEffect(() => {
    if (!path) {
      setAgentProvider(null);
      setAgentModel(null);
      setAgentEffort(null);
      setTurnMode("execute");
      return;
    }
    tauriConfig
      .read(path)
      .then((cfg) => {
        setAgentProvider((cfg.provider as string) ?? null);
        setAgentModel(normalizeLegacyModel((cfg.model as string) ?? null));
        setAgentEffort((cfg.effort as string) ?? null);
        setTurnMode(normalizeTurnMode(cfg.mode));
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

  // This conversation's reactive feed — the SDK conversation VM, the app's one
  // turn-state source (history seeded by the adapter on load; live turns
  // folded by the SDK machinery).
  const sessionFeedItems = useConversationFeed(path, selectedSessionKey);

  // The live turn state for this conversation, for the pending-interaction
  // override: `running` gates the card (a running turn shows the composer, not
  // the card) and `pendingInteraction` is the live source the derivation
  // prefers over the persisted activity fallback.
  const conversationVm = useConversationVm(path, selectedSessionKey);

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

  // The provider/model/effort the composer picker DISPLAYS. In personal (Teams)
  // mode this is the acting user's stored choice, falling back to the clamped
  // agent default; in shared mode it is the effective pin resolved above. The
  // SEND path still forwards the effective pin (below) — the gateway strips it
  // and re-injects each acting user's clamped choice per turn — so the two never
  // need to agree on the wire, only on screen.
  const displayModelPin = useMemo(
    () =>
      modelDecision.personal
        ? resolvePersonalModelPin(modelChoiceInfo?.choice, allowedModels, {
            provider: effectiveProvider,
            model: effectiveModel,
            effort: effectiveEffort,
          })
        : {
            provider: effectiveProvider,
            model: effectiveModel,
            effort: effectiveEffort,
          },
    [
      modelDecision.personal,
      modelChoiceInfo?.choice,
      allowedModels,
      effectiveProvider,
      effectiveModel,
      effectiveEffort,
    ],
  );

  // Converge legacy pin-less chats (created before per-conversation pins):
  // stamp the provider/model this open conversation currently displays — and
  // would send with — onto its activity, so a later change to the agent
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
        } else {
          setAgentProvider(prov);
          setAgentModel(mod);
          if (path) {
            const cfg = await tauriConfig.read(path);
            await tauriConfig.write(path, {
              ...cfg,
              provider: prov as "anthropic" | "openai",
              model: mod,
            });
          }
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
  const handleModeSelect = useCallback(
    async (mode: TurnMode) => {
      // Mode is per-agent composer memory (never synced to engine Settings):
      // persist it so the pill reopens where the user left it. Optimistic flip;
      // the actual plan/execute pin rides each send as `modeOverride`.
      setTurnMode(mode);
      try {
        if (path) {
          const cfg = await tauriConfig.read(path);
          await tauriConfig.write(path, { ...cfg, mode });
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

  // Route a composer model / effort pick. In personal (Teams) mode it writes the
  // acting user's per-agent choice (the gateway clamps it to the ceiling and
  // applies it per turn); in shared mode it keeps the existing agent-config /
  // activity-pin behavior. `.mutate` fires and forgets — the tauri wrapper's
  // `call()` surfaces any failure (e.g. `model_not_allowed`) as a toast once, so
  // awaiting here would only double-toast.
  const selectModel = useCallback(
    (prov: string, mod: string) => {
      if (modelDecision.personal) {
        setModelChoice.mutate({
          provider: prov,
          model: mod,
          effort: displayModelPin.effort,
        });
        return;
      }
      void handleModelSelect(prov, mod);
    },
    [
      modelDecision.personal,
      setModelChoice,
      displayModelPin.effort,
      handleModelSelect,
    ],
  );
  const selectEffort = useCallback(
    (effort: EffortLevel) => {
      if (modelDecision.personal) {
        setModelChoice.mutate({
          provider: displayModelPin.provider,
          model: displayModelPin.model,
          effort,
        });
        return;
      }
      void handleEffortSelect(effort);
    },
    [
      modelDecision.personal,
      setModelChoice,
      displayModelPin.provider,
      displayModelPin.model,
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
          // Pass the EFFECTIVE values, not just `chatProvider`. The dropdown
          // displays `effectiveProvider` (chatProvider ?? activityProvider ??
          // agentProvider ?? wsProvider), so the send must mirror it.
          // Passing only `chatProvider` lets the engine fall back to its own
          // resolution chain (which doesn't consult activity records),
          // producing the "dropdown says Gemini, response from Claude" bug.
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
          effortOverride: effectiveEffort,
          modeOverride: turnMode,
        });
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
            // See note above re: effectiveProvider over chatProvider.
            providerOverride: effectiveProvider,
            modelOverride: effectiveModel,
            effortOverride: effectiveEffort,
            modeOverride: turnMode,
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
      effectiveProvider,
      effectiveModel,
      effectiveEffort,
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
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
          effortOverride: effectiveEffort,
          modeOverride: turnMode,
        })
        .catch((err) => {
          addToast({
            title: t("chat:composio.followupFailed", { name: appName }),
            description: String(err),
            variant: "error",
          });
        });
    },
    [
      path,
      selectedSessionKey,
      effectiveProvider,
      effectiveModel,
      effectiveEffort,
      turnMode,
      addToast,
      t,
    ],
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
          autoGrant={canManageAgentGrants(capabilities, agent)}
          onConnected={handleIntegrationConnected}
        />
      );
    },
    [integrationsEnabled, agent, capabilities, handleIntegrationConnected],
  );

  // ── Pending-interaction override (ask_user / request_connection) ──────
  // The one thing the mission is waiting on the user for: the live VM
  // interaction if this client settled the turn, else the activity's persisted
  // one (reload / observer). Gated on `running` so a fresh turn's composer wins
  // and the card disappears the instant the user answers.
  const activeInteraction = deriveActiveInteraction({
    running: conversationVm?.running ?? false,
    live: conversationVm?.pendingInteraction,
    persisted: selectedActivity?.pending_interaction,
  });

  // Sends the composed interaction reply as a normal user message through the
  // existing follow-up send path; the turn start clears the interaction, so the
  // card retires through the same reactivity. A failure surfaces (no silent
  // swallow) — the composer is gone, so a toast is the only channel left.
  const sendInteractionMessage = useCallback(
    (text: string) => {
      if (!path || !selectedSessionKey) return;
      tauriChat
        .send(path, text, selectedSessionKey, {
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
          effortOverride: effectiveEffort,
          modeOverride: turnMode,
        })
        .catch((err) => {
          addToast({
            title: t("chat:errors.sessionStart", { error: String(err) }),
            variant: "error",
          });
        });
    },
    [
      path,
      selectedSessionKey,
      effectiveProvider,
      effectiveModel,
      effectiveEffort,
      turnMode,
      addToast,
      t,
    ],
  );

  const interactionLabels = useMemo(
    () => ({
      placeholder: t("chat:questionCard.placeholder"),
      send: t("chat:questionCard.send"),
      back: t("chat:questionCard.back"),
      forward: t("chat:questionCard.forward"),
      progress: (current: number, total: number) =>
        t("chat:questionCard.progress", { current, total }),
    }),
    [t],
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
  const composerOverride = useMemo<AIBoardProps["composerOverride"]>(() => {
    if (!agent || !activeInteraction) return undefined;
    const steps = activeInteraction.steps;
    const hasQuestionSteps = steps.some((step) => step.kind === "question");
    const connectedNames: string[] = [];
    return (
      <ChatInteractionCard
        steps={steps}
        labels={interactionLabels}
        onComplete={(answers: ChatInteractionAnswer[]) => {
          // ONE send after the LAST step: a sequence with questions replies with
          // the user's visible answers; a connect-only sequence resumes the
          // agent with a hidden auto-continue message (no fake user bubble).
          sendInteractionMessage(
            composeInteractionReply({
              answers,
              connectedNames,
              hasQuestionSteps,
              connectedLine: (name) =>
                t("chat:interaction.connectedLine", { name }),
            }),
          );
        }}
        renderConnect={(step, api) => (
          <ChatConnectInteractionCard
            toolkit={step.toolkit}
            agentId={agent.id}
            autoGrant={canManageAgentGrants(capabilities, agent)}
            reason={step.reason}
            onConnected={(_toolkit, appName) => {
              // Record the app and advance ONLY. The composed `onComplete`
              // reply resumes the agent once EVERY step is done; starting a
              // turn here would tear the card down before later connect steps
              // could complete.
              connectedNames.push(appName);
              api.onConnected();
            }}
          />
        )}
      />
    );
  }, [
    agent,
    activeInteraction,
    interactionLabels,
    sendInteractionMessage,
    capabilities,
    t,
  ]);

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
                modeOverride: turnMode,
              });
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
        // one — nothing was connected); label it with THIS chat's provider so
        // its reconnect flow targets the provider the send actually used.
        const providerError = resolveProviderErrorForChat(
          msg.providerError,
          effectiveProvider,
        );
        return (
          <ProviderErrorCard
            error={providerError}
            onRetry={async () => {
              if (!path || !selectedSessionKey) return;
              // A refused not-connected send never reached the engine —
              // the card resends the original message verbatim (and fires
              // itself on reconnect). Live-turn failures keep the generic
              // retry prompt (their context is already server-side).
              const text = providerErrorRetryText(
                providerError,
                t("chat:toolRuntimeError.retryPrompt"),
              );
              await tauriChat.send(path, text, selectedSessionKey, {
                providerOverride: effectiveProvider,
                modelOverride: effectiveModel,
                effortOverride: effectiveEffort,
                modeOverride: turnMode,
                // A refused not-connected send left its prompt's bubble in
                // the feed already — resending it must not add a second one.
                suppressUserBubble: resendsOriginalPrompt(providerError),
              });
            }}
            // "Pick another model" pops the MODEL picker (not the Skills picker);
            // "Switch to <fallback>" applies it directly on the same provider.
            onSwitchModel={() => setModelPickerOpen(true)}
            onApplyModel={(model) => selectModel(effectiveProvider, model)}
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
      turnMode,
      selectModel,
      path,
      selectedSessionKey,
      t,
    ],
  );
  const mapFeedItems = useCallback(
    ({ items }: { sessionKey: string; items: FeedItem[] }) =>
      filterAutoContinueFeedItems(filterProviderAuthFeedItems(items)),
    [],
  );
  const agentId = agent?.id;
  const afterMessages = useCallback(
    ({ feedItems }: { sessionKey: string; feedItems: FeedItem[] }) => {
      // While a just-created agent's engine is still warming up (HOU-693),
      // the user's sent message sits with no reply for minutes — say so right
      // under it. Only once something was sent: an empty chat stays clean.
      // The card unmounts itself when the readiness probe clears the store.
      const provisioningCard =
        agentId && feedItems.length > 0 ? (
          <AgentProvisioningCard agentId={agentId} />
        ) : null;
      // The persisted inline `UnauthenticatedCard` (a provider_error feed item)
      // is the stable reconnect surface. When it's already present for THIS
      // chat's provider, don't also render the store-driven card — it flickers
      // (auto-dismisses) when the provider's auth probe is unreliable, e.g.
      // codex reporting "authenticated" off a stale ~/.codex/auth.json after a
      // server-side session kill. One card, and it stays put.
      const hasInlineAuthCard = feedItems.some((it) =>
        isInlineAuthCardForChat(it, effectiveProvider),
      );
      if (hasInlineAuthCard) return provisioningCard;
      const signalKey = providerAuthSignalKey(feedItems);
      // Always hand the card THIS chat's provider so it can match the global
      // `authRequired` flag against the provider this chat actually uses — a
      // Claude logout must never surface a reconnect button in an OpenAI chat
      // (HOU-410). The card stays hidden unless that provider truly needs auth.
      return (
        <>
          {provisioningCard}
          <ProviderReconnectCard
            providerId={effectiveProvider}
            signalKey={signalKey ?? undefined}
          />
        </>
      );
    },
    [effectiveProvider, agentId],
  );

  // Shared-agent clarity (contract §6): when the agent is shared with more than
  // one teammate, everyone with access sees this same conversation. Surface a
  // subtle note above the composer so a teammate isn't surprised their reply is
  // visible to others. Multiplayer-only; the assignee count is only populated
  // for callers who receive it (owner / agent-managers).
  const showSharedNote =
    !!agent && isMultiplayer(capabilities) && isSharedWithOthers(agent);

  const composerHeader = useMemo<AIBoardProps["composerHeader"]>(() => {
    if (!agent) return undefined;
    if (!activeSkill && !showSharedNote) return undefined;
    return (
      <div className="flex flex-col gap-1.5">
        {showSharedNote && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5 shrink-0" />
            <span>{t("teams:share.chatNote")}</span>
          </div>
        )}
        {activeSkill && (
          <SelectedSkillChip
            skill={activeSkill}
            onCancel={() => setActiveSkill(null)}
          />
        )}
      </div>
    );
  }, [agent, activeSkill, showSharedNote, t]);

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
              title={skillDisplayTitle(s)}
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
    return ({ openFilePicker }) => (
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
      </div>
    );
  }, [agent, t]);

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
      <DictationSetupDialog modelSetup={modelSetup} />
    </>
  ) : null;

  return {
    chatEmptyState,
    composerHeader,
    composerOverride,
    canSendEmpty: activeSkill != null,
    onComposerSubmit: handleSkillComposerSubmit,
    footer,
    attachMenu,
    renderUserMessage,
    renderLink,
    isSpecialTool,
    renderToolResult,
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    loadingIndicator,
    renderTurnSummary,
    renderSystemMessage,
    mapFeedItems,
    afterMessages,
    pickerDialog,
    effectiveProvider,
    effectiveModel,
    turnMode,
    currentUserId,
    authorLabels,
    dictation,
  };
}
