import { AIBoard, type KanbanItem } from "@houston-ai/board";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity, useDeleteActivity } from "../../hooks/queries";
import { useArchivedHandoff } from "../../hooks/use-archived-handoff";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { useOpenConversationFeed } from "../../hooks/use-open-conversation-feed";
import { selectArchived } from "../../lib/mission-selection";
import { modelAcceptsImages } from "../../lib/providers";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { buildArchivedBoardItems } from "../board/agent-board-items";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { ArchivedEmptyState } from "./archived-empty-state";
import { ArchivedHeader } from "./archived-header";
import { useArchivedMissionSearch } from "./use-archived-mission-search";
import { useArchivedSendMessage } from "./use-archived-send-message";

/**
 * Archived missions: a column-less list of the agent's archived missions.
 * Clicking one opens its chat on the right. Sending a message re-activates
 * it — the engine flips the status from `archived` to `running` on session
 * start (`set_status_by_session_key`), so the mission leaves this tab and we
 * hand the user off to the active board to keep the conversation in view.
 */
export default function ArchivedTab({
  agent,
  agentDef,
  onBack,
}: TabProps & { onBack: () => void }) {
  const { t } = useTranslation("board");
  const path = agent.folderPath;
  const openHref = useOpenAgentHref(path);
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  const { data: rawItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const addToast = useUIStore((s) => s.addToast);
  const setAgentBoardMode = useUIStore((s) => s.setAgentBoardMode);

  const archived = useMemo(() => selectArchived(rawItems ?? []), [rawItems]);
  const items: KanbanItem[] = useMemo(
    () =>
      buildArchivedBoardItems({
        activities: rawItems ?? [],
        agentName: agent.name,
      }),
    [rawItems, agent.name],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sessionKeyFor = useCallback(
    (activityId: string) =>
      archived.find((a) => a.id === activityId)?.session_key ??
      `activity-${activityId}`,
    [archived],
  );
  const selectedSessionKey = selectedId ? sessionKeyFor(selectedId) : null;

  const handleReactivated = useCallback(() => setSelectedId(null), []);
  const focusActiveBoard = useCallback(
    () => setAgentBoardMode("active"),
    [setAgentBoardMode],
  );
  const { handoff, onSendReactivated } = useArchivedHandoff({
    missionId: selectedId,
    onReactivated: handleReactivated,
    focusBoard: focusActiveBoard,
  });

  const panel = useAgentChatPanel({
    agent,
    agentDef,
    selectedSessionKey,
    onSelectSession: setSelectedId,
    onSendReactivated,
  });
  const { effectiveProvider, effectiveModel } = panel;
  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(effectiveProvider, effectiveModel),
  });

  // Archived missions can be the longest transcripts of all, so the open chat
  // shows the tail window and prepends older pages on scroll (HOU-819).
  const { feedItems, hasOlderMessages, onLoadOlderMessages } =
    useOpenConversationFeed(path, selectedSessionKey);

  const archivedSearch = useArchivedMissionSearch(path, items);

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      await deleteActivity.mutateAsync(item.id);
      if (selectedId === item.id) setSelectedId(null);
    },
    [deleteActivity, selectedId],
  );

  const handleSendMessage = useArchivedSendMessage({
    agentPath: path,
    selectedId,
    archived,
    agentDef,
    effectiveProvider,
    effectiveModel,
    onHandoff: handoff,
  });
  const emptyState = (
    <ArchivedEmptyState
      hasQuery={archivedSearch.missionSearch.hasQuery}
      isSearchingText={archivedSearch.missionSearch.isSearchingText}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <ArchivedHeader
        search={archivedSearch.query}
        isSearchingText={archivedSearch.isLoading}
        searchable={items.length > 0 || archivedSearch.missionSearch.hasQuery}
        onSearchChange={archivedSearch.setQuery}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1">
        <AIBoard
          layout="list"
          listAlign="left"
          items={archivedSearch.missionSearch.items}
          searchSnippets={archivedSearch.missionSearch.snippets}
          selectedId={selectedId}
          onSelect={setSelectedId}
          panelContainer={panelContainer}
          feedItems={feedItems}
          sessionKeyFor={sessionKeyFor}
          onDelete={handleDelete}
          onSendMessage={handleSendMessage}
          onComposerSubmit={panel.onComposerSubmit}
          onLoadHistory={archivedSearch.loadHistory}
          onLoadOlderMessages={onLoadOlderMessages}
          hasOlderMessages={hasOlderMessages}
          emptyState={emptyState}
          onPanelOpenChange={setPanelOpen}
          onOpenLink={openHref}
          onNotice={(message) => addToast({ title: message })}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          cardAvatar={<AgentCardAvatar color={agent.color} />}
          thinkingIndicator={panel.thinkingIndicator}
          panelAgentName={agent.name}
          panelAvatar={<AgentPanelAvatar color={agent.color} running={false} />}
          cardLabels={{
            deleteTooltip: t("board:cardActions.deleteTooltip"),
            deleteTitle: (name: string) =>
              t("board:deleteCard.titleWithName", { name }),
            deleteDescription: t("board:deleteCard.description"),
          }}
          chatEmptyState={panel.chatEmptyState}
          composerHeader={panel.composerHeader}
          // Only the OFFERS an archived mission finished with, never a blocking
          // stepper: archiving answers nothing, so a mission archived mid-
          // question still carries its question steps (see
          // `offersComposerOverride`). Acting on an offer sends a message,
          // which re-activates the mission like any other send.
          composerOverride={panel.offersComposerOverride}
          composerOverrideMode="above"
          canSendEmpty={panel.canSendEmpty}
          footer={panel.footer}
          attachMenu={panel.attachMenu}
          renderUserMessage={panel.renderUserMessage}
          renderLink={panel.renderLink}
          currentUserId={panel.currentUserId}
          authorLabels={panel.authorLabels}
          showSenders={panel.showSenders}
          agentLabel={panel.agentLabel}
          renderSenderAvatar={panel.renderSenderAvatar}
          senderNameClass={panel.senderNameClass}
          {...panel.mentionProps}
          renderSystemMessage={panel.renderSystemMessage}
          conversationMap={panel.conversationMap}
          mapFeedItems={panel.mapFeedItems}
          afterMessages={panel.afterMessages}
          isSpecialTool={panel.isSpecialTool}
          renderToolResult={panel.renderToolResult}
          processLabels={panel.processLabels}
          getThinkingMessage={panel.getThinkingMessage}
          renderTurnSummary={panel.renderTurnSummary}
        />
      </div>
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </div>
  );
}
