import type { AIBoardProps } from "@houston-ai/board";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { panelTaskLabel } from "./panel-task-label";
import { useBoardLabels } from "./use-board-labels";
import type { useMissionControlArchived } from "./use-mission-control-archived";
import type { useMissionControlArchivedPanel } from "./use-mission-control-archived-panel";

type ArchivedData = ReturnType<typeof useMissionControlArchived>;
type ArchivedPanel = ReturnType<typeof useMissionControlArchivedPanel>;

/**
 * The chat half of an archived mission's `AIBoard`, shared by the desktop
 * archive list and the phone's pushed chat so an archived chat is ONE wiring
 * whichever breakpoint shows it. `chatProps` spreads into `<AIBoard>`;
 * `dialogs` mounts beside it.
 */
export function useArchivedChatProps(
  data: ArchivedData,
  archivedPanel: ArchivedPanel,
) {
  const { t } = useTranslation("board");
  const { labels } = useBoardLabels();
  const addToast = useUIStore((s) => s.addToast);
  const { selectedItem, activeAgent } = data;
  const { panel, attachmentValidation, openHref, onSendMessage } =
    archivedPanel;

  const chatProps = {
    feedItems: data.feedItems,
    sessionKeyFor: data.sessionKeyFor,
    onDelete: data.handleDelete,
    onSendMessage,
    onComposerSubmit: panel.onComposerSubmit,
    onLoadHistory: data.loadHistory,
    onLoadOlderMessages: data.onLoadOlderMessages,
    hasOlderMessages: data.hasOlderMessages,
    onOpenLink: openHref,
    onNotice: (message: string) => addToast({ title: message }),
    prepareAttachments: attachmentValidation.prepareAttachments,
    onAttachmentRejections: attachmentValidation.onAttachmentRejections,
    thinkingIndicator: panel.thinkingIndicator,
    panelAgentName: activeAgent?.name ?? selectedItem?.subtitle,
    // Composed here, never left to `ui/`'s English fallback.
    panelMissionLabel: panelTaskLabel(
      {
        task: (title) => t("panel.taskLabel", { title }),
        newTask: t("panel.newTask"),
      },
      data.selectedId,
      selectedItem?.title,
    ),
    panelAvatar: (
      <AgentPanelAvatar color={activeAgent?.color} running={false} />
    ),
    labels,
    cardLabels: {
      deleteTooltip: t("cardActions.deleteTooltip"),
      deleteTitle: (name: string) => t("deleteCard.titleWithName", { name }),
      deleteDescription: t("deleteCard.description"),
    },
    chatEmptyState: panel.chatEmptyState,
    composerHeader: panel.composerHeader,
    // Only the OFFERS an archived mission finished with, never a blocking
    // stepper: archiving answers nothing, so a mission archived mid-question
    // still carries its question steps (see `offersComposerOverride`). Acting
    // on an offer sends a message, which re-activates the mission like any
    // other send.
    composerOverride: panel.offersComposerOverride,
    composerOverrideMode: "above",
    canSendEmpty: panel.canSendEmpty,
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
    currentUserId: panel.currentUserId,
    authorLabels: panel.authorLabels,
    showSenders: panel.showSenders,
    agentLabel: panel.agentLabel,
    renderSenderAvatar: panel.renderSenderAvatar,
    senderNameClass: panel.senderNameClass,
    ...panel.mentionProps,
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

  return { chatProps, dialogs };
}
