/**
 * The routine chat's actual AIBoard mount, split out of
 * `routine-setup-chat.tsx` to keep that file focused on layout/chrome. Always
 * rendered inside a `hidden` wrapper by the caller: the list never shows,
 * only the portaled detail panel (into the chat view's own local container)
 * is visible — full page, since this is the entire tab content while a chat
 * is open (no more side-by-side editor).
 */
import type { KanbanItem } from "@houston-ai/board";
import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import type { Activity } from "@houston-ai/engine-client";
import { type ReactNode, useCallback, useMemo } from "react";
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
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useQueuedMessageLabels } from "../use-queued-message-labels";

const noop = () => {};

interface Props extends TabProps {
  activity: Activity;
  sessionKey: string | null;
  /** The chat view's own local container (never the app-wide mission panel). */
  panelContainer: HTMLDivElement | null;
  /** The Back button, rendered to the left of the agent avatar — the ONE
   *  header this chat has (no second header stacked above it). */
  panelLeading: ReactNode;
  /** Overrides the panel's auto "Mission: {title}" line (routines pass
   *  "Routine: {name}"). Omit to keep the default "Mission: {title}" — the
   *  custom-integration setup chat reuses this board and IS a mission, so it
   *  wants that default. */
  missionLabel?: string;
  /** Header actions on the panel's right side (the integration setup chat
   *  puts its "Done" button here). Omit for none (routines). */
  panelActions?: ReactNode;
}

export function RoutineSetupChatBoard({
  agent,
  agentDef,
  activity,
  sessionKey,
  panelContainer,
  panelLeading,
  missionLabel,
  panelActions,
}: Props) {
  const path = agent.folderPath;
  const queuedLabels = useQueuedMessageLabels();
  const { composerLabels } = useBoardLabels();
  const attachmentValidation = useAttachmentRejectionDialog();
  const addToast = useUIStore((s) => s.addToast);

  const panel = useAgentChatPanel({
    agent,
    agentDef,
    selectedSessionKey: sessionKey,
    onSelectSession: noop,
  });
  const overrides = useMemo(
    () => ({
      providerOverride: panel.effectiveProvider,
      modelOverride: panel.effectiveModel,
      modeOverride: panel.turnMode,
    }),
    [panel.effectiveProvider, panel.effectiveModel, panel.turnMode],
  );

  const rawItems = useMemo(() => [activity], [activity]);
  const send = useAgentBoardSend({
    agent,
    agentDef,
    rawItems,
    pendingAgentMode: null,
    setPendingAgentMode: noop,
  });
  const sendQueue = useBoardSendQueue({
    selectedSessionKey: sessionKey,
    selectedAgentPath: path,
    overrides,
    sendMessageNow: send.sendMessageNow,
  });

  const activeFeed = useConversationFeed(path, sessionKey);
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () => (sessionKey ? { [sessionKey]: activeFeed } : {}),
    [sessionKey, activeFeed],
  );
  const loadHistory = useCallback(
    async (key: string, opts?: HistoryLoadOptions) =>
      (await tauriChat.loadHistory(path, key, opts)) as FeedItem[],
    [path],
  );

  // Stable identity: AIBoard folds `sessionKeyFor` into its `hydrateSession`
  // callback, and its composer-autofocus effect is keyed on that callback. An
  // inline arrow gave it a fresh identity every render, re-firing the effect
  // and re-focusing the composer on EVERY chat re-render (a streaming/settling
  // reply, an activity refetch) instead of once on open — the composer would
  // yank focus back from wherever the user clicked. useCallback makes the
  // autofocus one-shot, matching every other AIBoard consumer.
  const keyForSession = useCallback(() => sessionKey ?? "", [sessionKey]);

  const items: KanbanItem[] = useMemo(
    () => [
      {
        id: activity.id,
        title: activity.title,
        description: "",
        status: activity.status,
        updatedAt: activity.updated_at ?? new Date().toISOString(),
        group: agent.name,
        metadata: sessionKey ? { sessionKey } : {},
      },
    ],
    [activity, agent.name, sessionKey],
  );

  const running = activity.status === "running";

  return (
    <>
      <AIBoard
        layout="list"
        items={items}
        selectedId={activity.id}
        onSelect={noop}
        panelContainer={panelContainer}
        // The chat is the entire tab content while open (HOU-725 rebuild):
        // clicking app chrome must not dismiss it — the tab's own Back
        // button is the only way out.
        disableOutsideClose
        hidePanelClose
        feedItems={feedItems}
        isLoading={send.effectiveLoading}
        sessionKeyFor={keyForSession}
        onSendMessage={sendQueue.handleSendMessage}
        onComposerSubmit={panel.onComposerSubmit}
        queuedMessages={sendQueue.queuedMessages}
        onRemoveQueuedMessage={sendQueue.onRemoveQueuedMessage}
        queuedLabels={queuedLabels}
        onLoadHistory={loadHistory}
        onStopSession={send.stopSession}
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
        panelLeading={panelLeading}
        panelActions={panelActions ? () => panelActions : undefined}
        panelAgentName={agent.name}
        panelMissionLabel={missionLabel}
        panelAvatar={<AgentPanelAvatar color={agent.color} running={running} />}
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
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </>
  );
}
