import type { AIBoardProps, MessageMention } from "@houston-ai/board";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { childMissionsOf, parentMissionOf } from "../../lib/child-missions";
import { modelAcceptsImages } from "../../lib/providers";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import type { BoardSource } from "./board-source";
import { panelTaskLabel } from "./panel-task-label";
import { useBoardDrafts } from "./use-board-drafts";
import { useBoardLabels } from "./use-board-labels";
import { useBoardSendQueue } from "./use-board-send-queue";

/**
 * Everything the CHAT half of a mission surface wires up, extracted from
 * `<MissionBoard>` so the phone's pushed mission-chat screen and the desktop
 * board render the SAME chat with one wiring: the `useAgentChatPanel`
 * integration, the send queue, draft persistence, attachment validation, and
 * the full ChatPanel prop block AIBoard forwards. The board keeps only what
 * is board-shaped (columns, selection, keyboard, drag, toolbar, portal).
 *
 * `chatProps` spreads straight into `<AIBoard>`; `dialogs` mounts beside it.
 */
export function useBoardChatWiring(source: BoardSource) {
  const { t } = useTranslation(["dashboard", "board"]);
  const addToast = useUIStore((s) => s.addToast);
  const queuedLabels = useQueuedMessageLabels();
  const { cardLabels, composerLabels } = useBoardLabels();
  const { drafts, onDraftChange } = useBoardDrafts(source.draftScope);

  // The panel's own task line, composed here rather than left to `ui/`'s
  // i18n-agnostic English fallback (`panelTaskLabel`).
  const panelLabel = useMemo(
    () =>
      panelTaskLabel(
        {
          task: (title) => t("board:panel.taskLabel", { title }),
          newTask: t("board:panel.newTask"),
        },
        source.selectedId,
        source.allItems.find((item) => item.id === source.selectedId)?.title,
      ),
    [t, source.selectedId, source.allItems],
  );

  // The missions the OPEN chat started (PRODUCT-1244), read off the surface's
  // own items so they stay live through the same invalidation the cards use;
  // and the inverse, the parent mission an agent-started chat came from.
  const childMissions = useMemo(
    () =>
      childMissionsOf(source.allItems, source.selectedSessionKey, {
        running: t("dashboard:columns.running"),
        needsYou: t("dashboard:columns.needsYou"),
        done: t("dashboard:columns.done"),
      }),
    [source.allItems, source.selectedSessionKey, t],
  );
  const parentMission = useMemo(
    () => parentMissionOf(source.allItems, source.selectedSessionKey),
    [source.allItems, source.selectedSessionKey],
  );

  const panel = useAgentChatPanel({
    agent: source.activeAgent,
    selectedSessionKey: source.selectedSessionKey,
    onSelectSession: source.onSelectSession,
    draftScope: source.draftScope,
    childMissions,
    parentMission,
    // Opening a child (or the parent) is the surface's ordinary selection:
    // the chat swaps to that mission, exactly as clicking its card would.
    onOpenChildMission: source.setSelectedId,
  });
  const overrides = useMemo(
    () => ({
      providerOverride: panel.effectiveProvider,
      modelOverride: panel.effectiveModel,
      modeOverride: panel.turnMode,
    }),
    [panel.effectiveProvider, panel.effectiveModel, panel.turnMode],
  );

  const sendQueue = useBoardSendQueue({
    selectedSessionKey: source.selectedSessionKey,
    selectedAgentPath: source.selectedAgentPath,
    overrides,
    sendMessageNow: source.sendMessageNow,
  });

  const handleCreateConversation = useCallback(
    (text: string, files: File[], mentions?: MessageMention[]) =>
      source.createConversation({ text, files, ...overrides, mentions }),
    [source.createConversation, overrides],
  );
  const handleNotice = useCallback(
    (message: string) => addToast({ title: message }),
    [addToast],
  );
  const handleOpenLink = useOpenAgentHref(
    source.activeAgent?.folderPath ?? null,
  );

  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(
      panel.effectiveProvider,
      panel.effectiveModel,
    ),
  });

  const chatProps = {
    feedItems: source.feedItems,
    isLoading: source.loading,
    onCreateConversation: handleCreateConversation,
    onSendMessage: sendQueue.handleSendMessage,
    sessionKeyFor: source.sessionKeyFor,
    queuedMessages: sendQueue.queuedMessages,
    onRemoveQueuedMessage: sendQueue.onRemoveQueuedMessage,
    queuedLabels,
    onLoadHistory: source.loadHistory,
    onLoadOlderMessages: source.onLoadOlderMessages,
    hasOlderMessages: source.hasOlderMessages,
    onStopSession: source.stopSession,
    drafts,
    onDraftChange,
    onNotice: handleNotice,
    composerLabels,
    currentUserId: panel.currentUserId,
    authorLabels: panel.authorLabels,
    showSenders: panel.showSenders,
    agentLabel: panel.agentLabel,
    renderSenderAvatar: panel.renderSenderAvatar,
    senderNameClass: panel.senderNameClass,
    ...panel.mentionProps,
    dictation: panel.dictation,
    prepareAttachments: attachmentValidation.prepareAttachments,
    onAttachmentRejections: attachmentValidation.onAttachmentRejections,
    onOpenLink: handleOpenLink,
    thinkingIndicator: panel.thinkingIndicator,
    panelAgentName: source.panelAgentName,
    panelMissionLabel: panelLabel,
    panelAvatar: (
      <AgentPanelAvatar
        color={source.activeAgent?.color}
        running={source.selectedRunning}
      />
    ),
    cardLabels,
    chatEmptyState: panel.chatEmptyState,
    composerHeader: panel.composerHeader,
    composerOverride: panel.composerOverride,
    composerOverrideMode: panel.composerOverrideMode,
    canSendEmpty: panel.canSendEmpty,
    onComposerSubmit: panel.onComposerSubmit,
    footer: panel.footer,
    attachMenu: panel.attachMenu,
    renderUserMessage: panel.renderUserMessage,
    onEditMessage: panel.onEditMessage,
    canEditMessage: panel.canEditMessage,
    editMessageLabel: panel.editMessageLabel,
    enableMessageCopy: panel.enableMessageCopy,
    canCopyMessage: panel.canCopyMessage,
    copyMessageLabel: panel.copyMessageLabel,
    messageEditing: panel.messageEditing,
    renderLink: panel.renderLink,
    renderSystemMessage: panel.renderSystemMessage,
    conversationMap: panel.conversationMap,
    mapFeedItems: panel.mapFeedItems,
    afterMessages: panel.afterMessages,
    isSpecialTool: panel.isSpecialTool,
    renderToolResult: panel.renderToolResult,
    processLabels: panel.processLabels,
    getThinkingMessage: panel.getThinkingMessage,
    renderTurnSummary: panel.renderTurnSummary,
  } satisfies Partial<AIBoardProps>;

  const dialogs = (
    <>
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </>
  );

  return { chatProps, cardLabels, dialogs };
}
