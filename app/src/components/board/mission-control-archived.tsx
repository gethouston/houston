import { AIBoard } from "@houston-ai/board";
import { Button } from "@houston-ai/core";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pendingMissionSurface } from "../../lib/board-surface-nav";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { ArchivedEmptyState } from "../agent/archived-empty-state";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useIsActiveView } from "../shell/keep-alive-views";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { useMissionSearch } from "../use-mission-search";
import { panelTaskLabel } from "./panel-task-label";
import { type MissionControlScope, useMcScope } from "./use-mc-scope.ts";
import { useMissionControlArchived } from "./use-mission-control-archived";
import { useMissionControlArchivedPanel } from "./use-mission-control-archived-panel";
import { usePendingMissionTarget } from "./use-pending-mission-target";

/**
 * Cross-agent Archived view for Mission Control: a column-less list of every
 * archived mission; clicking one opens its chat; sending re-activates it and
 * hands the user back to this screen's active board, with the mission's chat
 * open, to keep the conversation in view.
 *
 * `agents` is ALWAYS the full workspace roster, whoever is rendering: the sweep
 * behind it (`useMissionControlArchived`) keys the one shared
 * `all-conversations` query on it. A team's archive narrows what it RENDERS
 * through `scope` instead (the one-sweep rule, `useTeamBoardScope`).
 *
 * It says nothing about WHERE it is: the Archived TAB is lit for exactly as
 * long as this is on screen, so a title, a qualifier or a trail crumb here
 * would be the third thing on one screen saying the same word.
 */
export function MissionControlArchived({
  agents,
  onShowActive,
  scope,
  agentFilter,
  scopedAgents,
  newMissionMenuOpen,
  onNewMissionMenuChange,
  onNewMission,
}: {
  /** The FULL workspace roster, always. Never a team's slice. */
  agents: Agent[];
  onShowActive: () => void;
  /** Narrows what this archive renders. Every live caller is a team, so it is
   *  always passed; omitting it archives the whole roster. */
  scope?: MissionControlScope;
  /** The section's own agent filter capsule, rendered in the tools row. */
  agentFilter?: ReactNode;
  /** The team's agents — the "New task" menu's roster. */
  scopedAgents: Agent[];
  newMissionMenuOpen: boolean;
  onNewMissionMenuChange: (open: boolean) => void;
  onNewMission: (agent: Agent) => void;
}) {
  const { t } = useTranslation("board");
  const { t: tTeams } = useTranslation("teams");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  const addToast = useUIStore((s) => s.addToast);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const data = useMissionControlArchived(agents);

  // An @mention (or a notification) can name a mission that was archived long
  // ago, and the archive is the only surface that can open it. It claims those
  // targets and only those: an ACTIVE mission's id stays published for the
  // board this archive belongs to, which the owner's router swaps back in.
  const pendingId = useUIStore((s) => s.activityPanelId);
  const pendingSurface = pendingMissionSurface(
    data.rawConversations,
    pendingId,
  );
  usePendingMissionTarget({
    surface: "archived",
    pendingSurface,
    selectedId: data.selectedId,
    setSelectedId: data.setSelectedId,
    missionPanelOpen,
  });

  // Only the NARROWING is this surface's business now: the scope picker moved
  // to the team strip's breadcrumb, which owns the pin both surfaces read.
  const { agentFilteredItems } = useMcScope(agents, data.items, scope);
  const [search, setSearch] = useState("");

  // HOU-1165: there is ONE shell detail panel, shared by every kept-alive
  // screen. `MissionBoard` releases it when its screen hides, but the archive
  // is not a `MissionBoard` -- without its own release, a team archive left
  // with a mission open keeps portaling its chat into that panel after the
  // user navigates away.
  const isActive = useIsActiveView();
  useEffect(() => {
    if (isActive) return;
    data.setSelectedId(null);
    setPanelOpen(false);
  }, [isActive, data.setSelectedId, setPanelOpen]);

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

  const { selectedItem, activeAgent } = data;
  const { panel, attachmentValidation, openHref, onSendMessage } =
    useMissionControlArchivedPanel(data, onShowActive);

  return (
    <>
      <PageHeaderTools>
        {(oneRow) => (
          <MissionControlToolbar
            variant={oneRow ? "strip" : "row"}
            search={search}
            isSearchingText={missionSearch.isSearchingText}
            onSearchChange={setSearch}
            // Search, filter, primary action — the SAME left-to-right order the
            // active board's tools take. The archive's filter is by agent
            // rather than by person, but it sits in the same slot.
            agentFilter={agentFilter}
            modeToggle={
              <Button variant="secondary" size="sm" onClick={onShowActive}>
                {tTeams("teamView.archive.back")}
              </Button>
            }
            newMission={{
              agents: scopedAgents,
              menuOpen: newMissionMenuOpen,
              onMenuOpenChange: onNewMissionMenuChange,
              onPick: onNewMission,
            }}
            collapsed={missionPanelOpen}
          />
        )}
      </PageHeaderTools>
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
          onSendMessage={onSendMessage}
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
          // Composed here, never left to `ui/`'s English fallback.
          panelMissionLabel={panelTaskLabel(
            {
              task: (title) => t("panel.taskLabel", { title }),
              newTask: t("panel.newTask"),
            },
            data.selectedId,
            selectedItem?.title,
          )}
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
