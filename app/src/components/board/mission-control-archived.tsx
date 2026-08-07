import { AIBoard } from "@houston-ai/board";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useIsActiveView } from "../shell/keep-alive-views";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { ArchivedEmptyState } from "../tabs/archived-empty-state";
import { useMissionSearch } from "../use-mission-search";
import { type MissionControlScope, useMcScope } from "./use-mc-scope.ts";
import { useMissionControlArchived } from "./use-mission-control-archived";
import { useMissionControlArchivedPanel } from "./use-mission-control-archived-panel";

/**
 * Cross-agent Archived view for Mission Control. Same list UI as the per-agent
 * Archived tab, but spanning every agent: a column-less list of all archived
 * missions; clicking one opens its chat; sending re-activates it and hands the
 * user off to that agent's active board to keep the conversation in view.
 *
 * `agents` is ALWAYS the full workspace roster, whoever is rendering: the sweep
 * behind it (`useMissionControlArchived`) keys the one shared
 * `all-conversations` query on it. A team's archive narrows what it RENDERS
 * through `scope` instead (the one-sweep rule, `useTeamBoardScope`).
 */
export function MissionControlArchived({
  agents,
  onShowActive,
  scope,
}: {
  /** The FULL workspace roster, always. Never a team's slice. */
  agents: Agent[];
  onShowActive: () => void;
  /** Narrows what this board renders and names it. Omitted by the GLOBAL
   *  archive, which shows every agent and keeps the "Archived" title. */
  scope?: MissionControlScope;
}) {
  const { t } = useTranslation("board");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  const addToast = useUIStore((s) => s.addToast);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const data = useMissionControlArchived(agents);

  const { scopedAgents, agentFilteredItems, filterPath, setFilterPath } =
    useMcScope(agents, data.items, scope);
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
    useMissionControlArchivedPanel(data);

  return (
    <>
      <MissionControlToolbar
        // Names the BOARD this archive belongs to; the toolbar composes it
        // with the mode (`"<team> · Archived"`). Without it every team's
        // archive reads as the same anonymous "Archived" and the user cannot
        // tell whose they are looking at.
        title={scope?.title}
        agents={scopedAgents}
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
