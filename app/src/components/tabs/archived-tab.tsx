import type { KanbanItem } from "@houston-ai/board";
import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { mergeFeedHistory, messagePreviewText } from "@houston-ai/chat";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity, useDeleteActivity } from "../../hooks/queries";
import { selectArchived } from "../../lib/mission-selection";
import { openAgentHref } from "../../lib/open-href";
import type { TabProps } from "../../lib/types";
import { useFeedStore } from "../../stores/feeds";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { ArchivedEmptyState, ArchivedSearchBar } from "./archived-tab-search";
import { useArchivedMissionSearch } from "./use-archived-mission-search";
import { useArchivedSendMessage } from "./use-archived-send-message";

// Stable empty reference so the feed store selector doesn't return a new
// object every render when this agent has no feeds yet.
const EMPTY_FEED_BUCKET: Record<string, never> = Object.freeze({});

/**
 * Archived missions: a column-less list of the agent's archived missions.
 * Clicking one opens its chat on the right. Sending a message re-activates
 * it — the engine flips the status from `archived` to `running` on session
 * start (`set_status_by_session_key`), so the mission leaves this tab and we
 * hand the user off to the active board to keep the conversation in view.
 */
export default function ArchivedTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation("board");
  const path = agent.folderPath;
  const panelContainer = useDetailPanelContainer();
  const { data: rawItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const viewMode = useUIStore((s) => s.viewMode);
  const setFeed = useFeedStore((s) => s.setFeed);
  const attachmentValidation = useAttachmentRejectionDialog();

  const archived = useMemo(() => selectArchived(rawItems ?? []), [rawItems]);
  const items: KanbanItem[] = useMemo(
    () =>
      archived.map((a) => ({
        id: a.id,
        title: a.title,
        // Decode a Skill / attachment first-message marker to the user's words;
        // never echo the raw `<!--houston:...-->` on the card (HOU-425).
        description: messagePreviewText(a.description),
        status: a.status,
        updatedAt: a.updated_at ?? new Date().toISOString(),
        group: agent.name,
        metadata: { ...(a.session_key ? { sessionKey: a.session_key } : {}) },
      })),
    [archived, agent.name],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // All tabs stay mounted (hidden via CSS) and every AIBoard portals its
  // detail panel into the SAME shared container. Drop our selection whenever
  // this tab isn't the active one so we never stack a second chat panel on
  // top of the Activity board's.
  useEffect(() => {
    if (viewMode !== "archived" && selectedId !== null) setSelectedId(null);
  }, [viewMode, selectedId]);
  const sessionKeyFor = useCallback(
    (activityId: string) =>
      archived.find((a) => a.id === activityId)?.session_key ??
      `activity-${activityId}`,
    [archived],
  );
  const selectedSessionKey = selectedId ? sessionKeyFor(selectedId) : null;

  const panel = useAgentChatPanel({
    agent,
    agentDef,
    selectedSessionKey,
    onSelectSession: setSelectedId,
  });
  const { effectiveProvider, effectiveModel } = panel;

  const feedBucket = useFeedStore((s) => s.items[path]);
  const feedItems = feedBucket ?? EMPTY_FEED_BUCKET;

  const archivedSearch = useArchivedMissionSearch(path, items);
  const handleHistoryLoaded = useCallback(
    (sessionKey: string, history: FeedItem[]) => {
      // Reconcile the persisted slice with any live-bucket items (optimistic
      // or WS) by turn identity so a surfaced routine isn't shown twice (#363).
      const current = useFeedStore.getState().items[path]?.[sessionKey] ?? [];
      setFeed(path, sessionKey, mergeFeedHistory(history, current));
    },
    [path, setFeed],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      await deleteActivity.mutateAsync(item.id);
      if (selectedId === item.id) setSelectedId(null);
    },
    [deleteActivity, selectedId],
  );

  const handleReactivated = useCallback(() => setSelectedId(null), []);
  const handleSendMessage = useArchivedSendMessage({
    agentPath: path,
    selectedId,
    archived,
    agentDef,
    effectiveProvider,
    effectiveModel,
    onReactivated: handleReactivated,
  });
  const emptyState = (
    <ArchivedEmptyState
      hasQuery={archivedSearch.missionSearch.hasQuery}
      isSearchingText={archivedSearch.missionSearch.isSearchingText}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <ArchivedSearchBar
        value={archivedSearch.query}
        isSearchingText={archivedSearch.isLoading}
        visible={items.length > 0 || archivedSearch.missionSearch.hasQuery}
        onChange={archivedSearch.setQuery}
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
          onHistoryLoaded={handleHistoryLoaded}
          emptyState={emptyState}
          onPanelOpenChange={setMissionPanelOpen}
          onOpenLink={(url) => openAgentHref(url, path)}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          cardAvatar={<AgentCardAvatar color={agent.color} />}
          thinkingIndicator={panel.thinkingIndicator}
          endOfTurnIndicator={panel.endOfTurnIndicator}
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
          canSendEmpty={panel.canSendEmpty}
          footer={panel.footer}
          attachMenu={panel.attachMenu}
          renderUserMessage={panel.renderUserMessage}
          currentUserId={panel.currentUserId}
          authorLabels={panel.authorLabels}
          renderSystemMessage={panel.renderSystemMessage}
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
