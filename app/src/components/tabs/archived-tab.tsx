import type { KanbanItem } from "@houston-ai/board";
import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { messagePreviewText } from "@houston-ai/chat";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity, useDeleteActivity } from "../../hooks/queries";
import { useConversationVm } from "../../hooks/use-conversation-vm";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { selectArchived } from "../../lib/mission-selection";
import { modelAcceptsImages } from "../../lib/providers";
import { tauriChat } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { ArchivedEmptyState, ArchivedSearchBar } from "./archived-tab-search";
import { useArchivedMissionSearch } from "./use-archived-mission-search";
import { useArchivedSendMessage } from "./use-archived-send-message";

const EMPTY_FEED: FeedItem[] = [];

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
  const openHref = useOpenAgentHref(path);
  const panelContainer = useDetailPanelContainer();
  const { data: rawItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const addToast = useUIStore((s) => s.addToast);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const viewMode = useUIStore((s) => s.viewMode);

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
  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(effectiveProvider, effectiveModel),
  });

  // The open conversation's reactive feed from the SDK conversation VM
  // (history seeded by the adapter's loadHistory).
  const activeVm = useConversationVm(path, selectedSessionKey);
  const activeFeed = activeVm?.feed ?? EMPTY_FEED;
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () => (selectedSessionKey ? { [selectedSessionKey]: activeFeed } : {}),
    [selectedSessionKey, activeFeed],
  );
  // Scroll-up lazy-load (HOU-819): archived missions can be the longest
  // transcripts of all — the open chat shows the tail window and prepends
  // older pages on scroll.
  const hasOlderMessages = (activeVm?.historyWindow?.earliestLoaded ?? 0) > 0;
  const onLoadOlderMessages = useCallback(async () => {
    if (!selectedSessionKey) return;
    await tauriChat.loadOlderHistory(path, selectedSessionKey);
  }, [path, selectedSessionKey]);

  const archivedSearch = useArchivedMissionSearch(path, items);

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
          onLoadOlderMessages={onLoadOlderMessages}
          hasOlderMessages={hasOlderMessages}
          emptyState={emptyState}
          onPanelOpenChange={setMissionPanelOpen}
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
          canSendEmpty={panel.canSendEmpty}
          footer={panel.footer}
          attachMenu={panel.attachMenu}
          renderUserMessage={panel.renderUserMessage}
          renderLink={panel.renderLink}
          currentUserId={panel.currentUserId}
          authorLabels={panel.authorLabels}
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
