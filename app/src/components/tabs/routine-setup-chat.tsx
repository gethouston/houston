import type { KanbanItem } from "@houston-ai/board";
import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateActivity } from "../../hooks/queries";
import { useConversationFeed } from "../../hooks/use-conversation-vm";
import { openAgentHref } from "../../lib/open-href";
import { type HistoryLoadOptions, tauriChat } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useAgentBoardSend } from "../board/use-agent-board-send";
import { useBoardLabels } from "../board/use-board-labels";
import { useBoardSendQueue } from "../board/use-board-send-queue";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useQueuedMessageLabels } from "../use-queued-message-labels";

const noop = () => {};

interface Props extends TabProps {
  /**
   * The setup chat to render: the agent's draft create-chat (grid + new-
   * routine editor) or the opened routine's persisted chat. Null renders
   * nothing — the tab decides which chat belongs to the current view.
   */
  activity: Activity | null;
  /** Render the "continue setting up" banner (grid view only). */
  showBanner: boolean;
  /** Reopen the chat panel (the banner's Continue button). */
  onContinue: () => void;
}

/**
 * The routine-setup chat's only home. The guided chat is a real mission
 * under the hood, but every board filters it out — so this component mounts
 * its own AIBoard whose list stays hidden while the detail panel portals
 * into the shared right-side container (the Archived tab does the same).
 * The chat is permanent (HOU-725): once a routine claims it via
 * `setup_activity_id`, reopening that routine resumes this same
 * conversation, so a finished chat is never auto-archived.
 */
export function RoutineSetupChat({
  agent,
  agentDef,
  activity,
  showBanner,
  onContinue,
}: Props) {
  const { t } = useTranslation("routines");
  const path = agent.folderPath;
  const panelContainer = useDetailPanelContainer();
  const queuedLabels = useQueuedMessageLabels();
  const { composerLabels } = useBoardLabels();
  const attachmentValidation = useAttachmentRejectionDialog();
  const addToast = useUIStore((s) => s.addToast);
  const viewMode = useUIStore((s) => s.viewMode);
  const openAgentId = useUIStore((s) => s.routineSetupChatAgentId);
  const setOpenAgentId = useUIStore((s) => s.setRoutineSetupChatAgentId);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const updateActivity = useUpdateActivity(path);

  // The flag is agent-scoped, so switching agents shows the other agent's
  // Routines tab closed without clobbering a pending cross-agent nav.
  const open = openAgentId === agent.id;
  const setOpen = useCallback(
    (next: boolean) => setOpenAgentId(next ? agent.id : null),
    [setOpenAgentId, agent.id],
  );

  // All tabs stay mounted and every AIBoard portals its panel into the SAME
  // shared container: drop our panel whenever the Routines tab isn't active.
  useEffect(() => {
    if (viewMode !== "routines" && open) setOpen(false);
  }, [viewMode, open, setOpen]);

  const sessionKey = activity
    ? (activity.session_key ?? `activity-${activity.id}`)
    : null;
  const selectedId = open && activity ? activity.id : null;
  const selectedSessionKey = selectedId ? sessionKey : null;

  const handleSelect = useCallback(
    (id: string | null) => {
      if (!id) setOpen(false);
    },
    [setOpen],
  );

  const panel = useAgentChatPanel({
    agent,
    agentDef,
    selectedSessionKey,
    onSelectSession: handleSelect,
  });
  const overrides = useMemo(
    () => ({
      providerOverride: panel.effectiveProvider,
      modelOverride: panel.effectiveModel,
      modeOverride: panel.turnMode,
    }),
    [panel.effectiveProvider, panel.effectiveModel, panel.turnMode],
  );

  const rawItems = useMemo(() => (activity ? [activity] : []), [activity]);
  const send = useAgentBoardSend({
    agent,
    agentDef,
    rawItems,
    pendingAgentMode: null,
    setPendingAgentMode: noop,
  });
  const sendQueue = useBoardSendQueue({
    selectedSessionKey,
    selectedAgentPath: path,
    overrides,
    sendMessageNow: send.sendMessageNow,
  });

  const activeFeed = useConversationFeed(path, selectedSessionKey);
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () => (selectedSessionKey ? { [selectedSessionKey]: activeFeed } : {}),
    [selectedSessionKey, activeFeed],
  );
  const loadHistory = useCallback(
    async (key: string, opts?: HistoryLoadOptions) =>
      (await tauriChat.loadHistory(path, key, opts)) as FeedItem[],
    [path],
  );

  const items: KanbanItem[] = useMemo(
    () =>
      activity
        ? [
            {
              id: activity.id,
              title: activity.title,
              description: "",
              status: activity.status,
              updatedAt: activity.updated_at ?? new Date().toISOString(),
              group: agent.name,
              metadata: sessionKey ? { sessionKey } : {},
            },
          ]
        : [],
    [activity, agent.name, sessionKey],
  );

  const discard = useCallback(() => {
    if (!activity) return;
    updateActivity.mutate({
      activityId: activity.id,
      update: { status: "archived" },
    });
  }, [activity, updateActivity]);

  if (!activity) return null;
  const running = activity.status === "running";

  return (
    <>
      {showBanner && !open && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {t("setupChat.bannerTitle")}
            </p>
            <p className="text-xs text-foreground/70">
              {t("setupChat.bannerDescription")}
            </p>
          </div>
          <Button variant="ghost" onClick={discard}>
            {t("setupChat.discard")}
          </Button>
          <Button onClick={onContinue}>{t("setupChat.continue")}</Button>
        </div>
      )}
      {/* The list never shows; only the portaled detail panel is visible. */}
      <div className="hidden">
        <AIBoard
          layout="list"
          items={items}
          selectedId={selectedId}
          onSelect={handleSelect}
          panelContainer={panelContainer}
          feedItems={feedItems}
          isLoading={send.effectiveLoading}
          sessionKeyFor={() => sessionKey ?? ""}
          onSendMessage={sendQueue.handleSendMessage}
          onComposerSubmit={panel.onComposerSubmit}
          queuedMessages={sendQueue.queuedMessages}
          onRemoveQueuedMessage={sendQueue.onRemoveQueuedMessage}
          queuedLabels={queuedLabels}
          onLoadHistory={loadHistory}
          onStopSession={send.stopSession}
          onPanelOpenChange={setMissionPanelOpen}
          onOpenLink={(url) => openAgentHref(url, path)}
          onNotice={(message) => addToast({ title: message })}
          // The ask_user question card that replaces the composer when the
          // turn settles needs_you — the interview IS this card, so dropping
          // it turns the guided setup into a dead chat.
          composerOverride={panel.composerOverride}
          composerLabels={composerLabels}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          thinkingIndicator={panel.thinkingIndicator}
          loadingIndicator={panel.loadingIndicator}
          panelAgentName={agent.name}
          panelAvatar={
            <AgentPanelAvatar color={agent.color} running={running} />
          }
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
