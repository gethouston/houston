import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AIBoard } from "@houston-ai/board";
import type { KanbanItem } from "@houston-ai/board";
import { mergeFeedHistory } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@houston-ai/core";
import { Archive } from "lucide-react";

import { useFeedStore } from "../../stores/feeds";
import { useUIStore } from "../../stores/ui";
import { useActivity, useDeleteActivity } from "../../hooks/queries";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { tauriChat, tauriAttachments } from "../../lib/tauri";
import { openAgentHref } from "../../lib/open-href";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import { analytics } from "../../lib/analytics";
import { selectArchived } from "../../lib/mission-selection";
import type { TabProps } from "../../lib/types";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { HoustonThinkingIndicator } from "../shell/experience-card";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";

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
  const { t } = useTranslation(["board", "chat"]);
  const path = agent.folderPath;
  const panelContainer = useDetailPanelContainer();
  const { data: rawItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setFeed = useFeedStore((s) => s.setFeed);
  const attachmentValidation = useAttachmentRejectionDialog();

  const archived = useMemo(() => selectArchived(rawItems ?? []), [rawItems]);
  const items: KanbanItem[] = useMemo(
    () =>
      archived.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
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
      archived.find((a) => a.id === activityId)?.session_key ?? `activity-${activityId}`,
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

  const loadHistory = useCallback(
    async (sessionKey: string) =>
      (await tauriChat.loadHistory(path, sessionKey)) as FeedItem[],
    [path],
  );
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

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      // Use the selected activity id (not a derived session key): routine
      // missions carry a `routine-{id}` session key, so stripping `activity-`
      // would yield the wrong id for attachments + the handoff.
      const missionId = selectedId ?? sessionKey.replace(/^activity-/, "");
      const activity = archived.find((a) => a.id === missionId);
      const mode = agentDef.config.agents?.find((m) => m.id === activity?.agent);
      try {
        const paths = await tauriAttachments.save(`activity-${missionId}`, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        await tauriChat.send(path, prompt, sessionKey, {
          mode: mode?.promptFile,
          workingDirOverride: activity?.worktree_path ?? undefined,
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
        });
        pushFeedItem(path, sessionKey, { feed_type: "user_message", data: prompt });
        analytics.track("chat_message_sent");
        for (const f of files) {
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        }
        // The engine has flipped this mission back to `running`, so it leaves
        // the archived list. Hand the user to the active board with the
        // conversation open so they keep typing where it now lives.
        setSelectedId(null);
        setViewMode("activity");
        setActivityPanelId(missionId, { forceOpen: true });
      } catch (err) {
        pushFeedItem(path, sessionKey, {
          feed_type: "system_message",
          data: t("chat:errors.sessionStart", { error: String(err) }),
        });
        throw err;
      }
    },
    [path, selectedId, archived, agentDef, effectiveProvider, effectiveModel, pushFeedItem, setViewMode, setActivityPanelId, t],
  );

  const emptyState = (
    <Empty className="border-0">
      <EmptyHeader>
        <Archive className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <EmptyTitle>{t("board:archived.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("board:archived.emptyDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <AIBoard
          layout="list"
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          panelContainer={panelContainer}
          feedItems={feedItems}
          sessionKeyFor={sessionKeyFor}
          onDelete={handleDelete}
          onSendMessage={handleSendMessage}
          onComposerSubmit={panel.onComposerSubmit}
          onLoadHistory={loadHistory}
          onHistoryLoaded={handleHistoryLoaded}
          emptyState={emptyState}
          onPanelOpenChange={setMissionPanelOpen}
          onOpenLink={(url) => openAgentHref(url, path)}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          cardAvatar={<AgentCardAvatar color={agent.color} />}
          thinkingIndicator={<HoustonThinkingIndicator />}
          panelAgentName={agent.name}
          panelAvatar={<AgentPanelAvatar color={agent.color} running={false} />}
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
        />
      </div>
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </div>
  );
}
