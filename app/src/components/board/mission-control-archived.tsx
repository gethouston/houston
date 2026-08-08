import { AIBoard } from "@houston-ai/board";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useArchivedHandoff } from "../../hooks/use-archived-handoff";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { modelAcceptsImages } from "../../lib/providers";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { ArchivedEmptyState } from "../tabs/archived-empty-state";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useMissionSearch } from "../use-mission-search";
import { useLatchedMissionAgent } from "./use-latched-mission-agent";
import { useMissionControlArchived } from "./use-mission-control-archived";
import { useMissionControlArchivedSend } from "./use-mission-control-archived-send";

/**
 * Cross-agent Archived view for Mission Control. Same list UI as the per-agent
 * Archived tab, but spanning every agent: a column-less list of all archived
 * missions; clicking one opens its chat; sending re-activates it and hands the
 * user off to that agent's active board to keep the conversation in view.
 */
export function MissionControlArchived({
  agents,
  onShowActive,
}: {
  agents: Agent[];
  onShowActive: () => void;
}) {
  const { t } = useTranslation("board");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  const addToast = useUIStore((s) => s.addToast);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const data = useMissionControlArchived(agents);

  const [filterPath, setFilterPath] = useState("");
  const [search, setSearch] = useState("");
  const agentFilteredItems = useMemo(
    () =>
      filterPath
        ? data.items.filter((i) => i.metadata?.agentPath === filterPath)
        : data.items,
    [data.items, filterPath],
  );
  const handleSearchError = useCallback(() => {
    addToast({
      title: t("search.historyErrorTitle"),
      description: t("search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  const missionSearch = useMissionSearch({
    items: agentFilteredItems,
    query: search,
    loadHistory: data.loadHistory,
    onHistoryLoadError: handleSearchError,
  });

  const { selectedItem, activeAgent, activeAgentDef } = data;

  const clearSelection = useCallback(() => data.setSelectedId(null), [data]);
  // The mission's agent, captured while it is still LISTED: the handoff fires
  // after a send that re-activates the mission, by which point this list has
  // refetched without it (see `useLatchedMissionAgent`).
  const focusMissionAgent = useLatchedMissionAgent(
    data.selectedId,
    activeAgent,
  );
  const { handoff, onSendReactivated } = useArchivedHandoff({
    missionId: data.selectedId,
    onReactivated: clearSelection,
    focusBoard: focusMissionAgent,
  });

  const panel = useAgentChatPanel({
    agent: activeAgent,
    agentDef: activeAgentDef,
    selectedSessionKey: data.selectedSessionKey,
    onSelectSession: data.setSelectedId,
    onSendReactivated,
  });
  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(
      panel.effectiveProvider,
      panel.effectiveModel,
    ),
  });
  const openHref = useOpenAgentHref(activeAgent?.folderPath ?? null);
  const handleSendMessage = useMissionControlArchivedSend({
    activeAgent,
    activeAgentDef,
    selectedItem,
    providerOverride: panel.effectiveProvider,
    modelOverride: panel.effectiveModel,
    onHandoff: handoff,
  });

  return (
    <>
      <MissionControlToolbar
        agents={agents}
        filterPath={filterPath}
        search={search}
        isSearchingText={missionSearch.isSearchingText}
        onFilterPathChange={setFilterPath}
        onSearchChange={setSearch}
        archivedActive
        onBack={onShowActive}
        onNewMission={() => {
          // Mirror the per-agent Archived tab: New mission lives in the bar
          // here too. Return to the active board, then open its agent picker
          // (the active source registers onStartMission once it mounts).
          onShowActive();
          setTimeout(() => useUIStore.getState().onStartMission?.(), 50);
        }}
        collapsed={missionPanelOpen}
      />
      <div className="flex-1 min-h-0">
        <AIBoard
          layout="list"
          listAlign="left"
          items={missionSearch.items}
          searchSnippets={missionSearch.snippets}
          selectedId={data.selectedId}
          onSelect={data.setSelectedId}
          panelContainer={panelContainer}
          feedItems={data.feedItems}
          sessionKeyFor={data.sessionKeyFor}
          onDelete={data.handleDelete}
          onSendMessage={handleSendMessage}
          onComposerSubmit={panel.onComposerSubmit}
          onLoadHistory={data.loadHistory}
          onLoadOlderMessages={data.onLoadOlderMessages}
          hasOlderMessages={data.hasOlderMessages}
          emptyState={
            <ArchivedEmptyState
              hasQuery={missionSearch.hasQuery}
              isSearchingText={missionSearch.isSearchingText}
            />
          }
          onPanelOpenChange={setPanelOpen}
          onOpenLink={openHref}
          onNotice={(message) => addToast({ title: message })}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          thinkingIndicator={panel.thinkingIndicator}
          panelAgentName={activeAgent?.name ?? selectedItem?.subtitle}
          panelAvatar={
            <AgentPanelAvatar color={activeAgent?.color} running={false} />
          }
          cardLabels={{
            deleteTooltip: t("cardActions.deleteTooltip"),
            deleteTitle: (name: string) =>
              t("deleteCard.titleWithName", { name }),
            deleteDescription: t("deleteCard.description"),
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
          onEditMessage={panel.onEditMessage}
          canEditMessage={panel.canEditMessage}
          editMessageLabel={panel.editMessageLabel}
          enableMessageCopy={panel.enableMessageCopy}
          canCopyMessage={panel.canCopyMessage}
          copyMessageLabel={panel.copyMessageLabel}
          messageEditing={panel.messageEditing}
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
    </>
  );
}
