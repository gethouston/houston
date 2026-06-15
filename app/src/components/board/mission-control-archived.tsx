import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AIBoard } from "@houston-ai/board";

import { useUIStore } from "../../stores/ui";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { openAgentHref } from "../../lib/open-href";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useMissionSearch } from "../use-mission-search";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { ArchivedEmptyState } from "../tabs/archived-tab-search";
import { useMissionControlArchived } from "./use-mission-control-archived";
import { useMissionControlArchivedSend } from "./use-mission-control-archived-send";
import type { Agent } from "../../lib/types";

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
  const panelContainer = useDetailPanelContainer();
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const addToast = useUIStore((s) => s.addToast);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const data = useMissionControlArchived(agents);
  const attachmentValidation = useAttachmentRejectionDialog();

  const [filterPath, setFilterPath] = useState("");
  const [search, setSearch] = useState("");
  const agentFilteredItems = useMemo(
    () => (filterPath ? data.items.filter((i) => i.metadata?.agentPath === filterPath) : data.items),
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

  const selectedItem = data.selectedId
    ? data.items.find((i) => i.id === data.selectedId) ?? null
    : null;
  const activeAgent = selectedItem
    ? data.agentMap[selectedItem.metadata?.agentPath as string] ?? null
    : null;
  const activeAgentDef = activeAgent ? getAgentDef(activeAgent.configId) ?? null : null;
  const selectedSessionKey = selectedItem
    ? (selectedItem.metadata?.sessionKey as string | undefined) ?? `activity-${selectedItem.id}`
    : null;

  const panel = useAgentChatPanel({
    agent: activeAgent,
    agentDef: activeAgentDef,
    selectedSessionKey,
    onSelectSession: data.setSelectedId,
  });
  const clearSelection = useCallback(() => data.setSelectedId(null), [data]);
  const handleSendMessage = useMissionControlArchivedSend({
    activeAgent,
    activeAgentDef,
    selectedItem,
    providerOverride: panel.effectiveProvider,
    modelOverride: panel.effectiveModel,
    onReactivated: clearSelection,
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
        onToggleArchived={onShowActive}
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
          onHistoryLoaded={data.handleHistoryLoaded}
          emptyState={
            <ArchivedEmptyState
              hasQuery={missionSearch.hasQuery}
              isSearchingText={missionSearch.isSearchingText}
            />
          }
          onPanelOpenChange={setMissionPanelOpen}
          onOpenLink={(url) => activeAgent && openAgentHref(url, activeAgent.folderPath)}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          thinkingIndicator={panel.thinkingIndicator}
          panelAgentName={activeAgent?.name ?? selectedItem?.subtitle}
          panelAvatar={<AgentPanelAvatar color={activeAgent?.color} running={false} />}
          cardLabels={{
            deleteTooltip: t("cardActions.deleteTooltip"),
            deleteTitle: (name: string) => t("deleteCard.titleWithName", { name }),
            deleteDescription: t("deleteCard.description"),
          }}
          chatEmptyState={panel.chatEmptyState}
          composerHeader={panel.composerHeader}
          canSendEmpty={panel.canSendEmpty}
          footer={panel.footer}
          attachMenu={panel.attachMenu}
          renderUserMessage={panel.renderUserMessage}
          renderSystemMessage={panel.renderSystemMessage}
          mapFeedItems={panel.mapFeedItems}
          afterMessages={panel.afterMessages}
          isSpecialTool={panel.isSpecialTool}
          renderToolResult={panel.renderToolResult}
          processLabels={panel.processLabels}
          getThinkingMessage={panel.getThinkingMessage}
          endOfTurnIndicator={panel.endOfTurnIndicator}
          renderTurnSummary={panel.renderTurnSummary}
          renderLink={panel.renderLink}
          transformContent={panel.transformContent}
        />
      </div>
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </>
  );
}
