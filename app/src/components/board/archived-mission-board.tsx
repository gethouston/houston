import { AIBoard } from "@houston-ai/board";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { ArchivedEmptyState } from "../agent/archived-empty-state";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import type { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import type { useMissionSearch } from "../use-mission-search";
import { panelTaskLabel } from "./panel-task-label";
import type { useMissionControlArchived } from "./use-mission-control-archived";
import type { useMissionControlArchivedPanel } from "./use-mission-control-archived-panel";

type ArchivedData = ReturnType<typeof useMissionControlArchived>;
type ArchivedPanel = ReturnType<typeof useMissionControlArchivedPanel>;
type MissionSearch = ReturnType<typeof useMissionSearch>;
type ShellDetailPanel = ReturnType<typeof useShellDetailPanel>;

/**
 * The RENDERING half of the cross-agent Archived view: the column-less list of
 * archived missions, the selected mission's chat portaled into the shared shell
 * panel, and the two dialogs that chat can raise.
 *
 * Its own file because everything above it in `mission-control-archived.tsx` is
 * WIRING — the sweep, the scope, the search box, the pending-target routing,
 * the release-on-hide — and none of it is readable next to the ~80 props this
 * board hands `AIBoard`. It takes the wiring's hooks whole, typed off their
 * return types, so the seam can never drift from what those hooks actually
 * return.
 *
 * It owns no state: every decision is made above and read straight off `data`,
 * `missionSearch` and `archivedPanel`.
 */
export function ArchivedMissionBoard({
  data,
  missionSearch,
  archivedPanel,
  panelContainer,
  setPanelOpen,
}: {
  data: ArchivedData;
  missionSearch: MissionSearch;
  archivedPanel: ArchivedPanel;
  panelContainer: ShellDetailPanel["panelContainer"];
  setPanelOpen: ShellDetailPanel["setPanelOpen"];
}) {
  const { t } = useTranslation("board");
  const addToast = useUIStore((s) => s.addToast);
  const { selectedItem, activeAgent } = data;
  const { panel, attachmentValidation, openHref, onSendMessage } =
    archivedPanel;

  return (
    <>
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
