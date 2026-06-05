import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AIBoard } from "@houston-ai/board";

import { useUIStore } from "../../stores/ui";
import { useAgentStore } from "../../stores/agents";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useFeedStore } from "../../stores/feeds";
import { openAgentHref } from "../../lib/open-href";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { analytics } from "../../lib/analytics";
import { classifyFileKind } from "../../lib/file-kind";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { HoustonThinkingIndicator } from "../shell/experience-card";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useMissionSearch } from "../use-mission-search";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { ArchivedEmptyState } from "../tabs/archived-tab-search";
import { useMissionControlArchived } from "./use-mission-control-archived";
import type { Agent } from "../../lib/types";

/**
 * Cross-agent Archived view for Mission Control. Same list UI as the per-agent
 * Archived tab, but spanning every agent: a column-less list of all archived
 * missions; clicking one opens its chat; sending a message re-activates it
 * (the engine flips `archived → running` on session start) and hands the user
 * off to that agent's active board to keep the conversation in view.
 */
export function MissionControlArchived({
  agents,
  onShowActive,
}: {
  agents: Agent[];
  onShowActive: () => void;
}) {
  const { t } = useTranslation(["dashboard", "board", "chat"]);
  const panelContainer = useDetailPanelContainer();
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const addToast = useUIStore((s) => s.addToast);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);

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
      title: t("board:search.historyErrorTitle"),
      description: t("board:search.historyErrorDescription"),
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

  // Sending re-activates the archived mission. Mirror the per-agent Archived
  // tab: send, then hand off to the mission's agent board with the chat open
  // (and drop back to Mission Control's active view for when the user returns).
  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      if (!activeAgent || !selectedItem) return;
      const agentPath = activeAgent.folderPath;
      const missionId = selectedItem.id;
      const mode = activeAgentDef?.config.agents?.find(
        (m) => m.id === (selectedItem.metadata?.agent as string | undefined),
      );
      const worktreePath = selectedItem.metadata?.worktreePath as string | undefined;
      try {
        const paths = await tauriAttachments.save(`activity-${missionId}`, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        await tauriChat.send(agentPath, prompt, sessionKey, {
          mode: mode?.promptFile,
          workingDirOverride: worktreePath ?? undefined,
          providerOverride: panel.effectiveProvider,
          modelOverride: panel.effectiveModel,
        });
        pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: prompt });
        analytics.track("chat_message_sent");
        for (const f of files) analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        // Reactivated (archived → running). Switching to the agent's board
        // unmounts Mission Control, so showArchived resets on its next mount —
        // no need to flip it here. Hand off with the chat open.
        data.setSelectedId(null);
        useAgentStore.getState().setCurrent(activeAgent);
        setViewMode("activity");
        setActivityPanelId(missionId, { forceOpen: true });
      } catch (err) {
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: t("chat:errors.sessionStart", { error: String(err) }),
        });
        throw err;
      }
    },
    [activeAgent, selectedItem, activeAgentDef, panel.effectiveProvider, panel.effectiveModel, pushFeedItem, setViewMode, setActivityPanelId, data, t],
  );

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
      />
      <div className="flex-1 min-h-0">
        <AIBoard
          layout="list"
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
          thinkingIndicator={<HoustonThinkingIndicator />}
          panelAgentName={activeAgent?.name ?? selectedItem?.subtitle}
          panelAvatar={<AgentPanelAvatar color={activeAgent?.color} running={false} />}
          cardLabels={{
            deleteTooltip: t("board:cardActions.deleteTooltip"),
            deleteTitle: (name: string) => t("board:deleteCard.titleWithName", { name }),
            deleteDescription: t("board:deleteCard.description"),
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
