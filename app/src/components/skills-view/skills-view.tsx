import {
  CATALOG_PLANE_MAX_W,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
  useIsMobile,
} from "@houston-ai/core";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageContainer } from "../shell/page-shell";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./manage-skill-dialog-props";
import { SkillEditorPage } from "./skill-editor-page";
import { SkillsReady } from "./skills-ready";
import { useGlobalChatFlow } from "./use-global-chat-flow";
import { useSharedSkills } from "./use-shared-skills";
import { useSharedSkillsActions } from "./use-shared-skills-actions";
import { useSkillsEditorNav } from "./use-skills-editor-nav";
import { useSkillsViewActions } from "./use-skills-view-actions";
import { useWorkspaceSkills } from "./use-workspace-skills";
import { useWorkspaceSkillRows } from "./workspace-skill-rows";

/**
 * The shared Skills library: one place to see and manage skills across every
 * agent in the workspace. A shared deployment stores a skill once and agents
 * enable it; elsewhere installs and edits fan out through agent-scoped routes.
 *
 * A BODY, not a page: it is the Skills tab of the Integrations screen, which
 * owns the header strip and the tools provider around it. Two screens share
 * that frame. The LIST is the library, under the screen's tab cluster
 * (`listHeader`); clicking a skill replaces the whole thing with that skill's
 * EDITOR — its workflow (or markdown) here, its chat in the shell's right
 * panel. The editor brings its OWN strip, whose back arrow returns to the
 * list, so the tab cluster and that back never stand in the same row.
 * "Create skill" opens the guided create chat in the same panel with the list
 * still on the left.
 */
export function SkillsBody({ listHeader }: { listHeader: ReactNode }) {
  const { t } = useTranslation("skills");
  const agents = useAgentStore((s) => s.agents);
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const { capabilities } = useCapabilities();
  // Store-backed when the deployment serves the workspace-shared skills store
  // (ADR 0003); otherwise the copy-based HOU-792 model, unchanged.
  const sharedMode =
    capabilities?.sharedSkills === true && workspaceId !== null;
  const copyModel = useWorkspaceSkills(agents);
  const sharedModel = useSharedSkills({
    enabled: sharedMode,
    workspaceId,
    agents,
    listsByPath: copyModel.listsByPath,
  });
  const actions = useSkillsViewActions();
  const sharedActions = useSharedSkillsActions(workspaceId);

  const rows: ManagedSkillRow[] = sharedMode
    ? sharedModel.rows
    : copyModel.rows;
  const listsByPath = copyModel.listsByPath;
  const loading = sharedMode
    ? copyModel.loading || sharedModel.loading
    : copyModel.loading;
  const [query, setQuery] = useState("");

  // The panel COVERS the content below md, so a phone opens the chat on
  // demand instead of burying the editor the tap just opened.
  const isMobile = useIsMobile();
  // The chat host and the editor nav each need the other: the chat's "Edit
  // manually" drives the left pane, and entering the editor opens the chat.
  // A ref breaks the cycle without a second render.
  const openTextRef = useRef<(slug: string) => void>(() => {});
  const onEditSkill = useCallback((slug: string) => {
    openTextRef.current(slug);
  }, []);
  const chat = useGlobalChatFlow({ agents, listsByPath, onEditSkill });
  const nav = useSkillsEditorNav({
    rows,
    rowsLoaded: !loading,
    openChat: chat.openForSkill,
    closeChat: chat.close,
    autoOpenChat: !isMobile,
  });
  openTextRef.current = nav.openText;

  const { installed, installedCount } = useWorkspaceSkillRows(
    rows,
    query,
    nav.open,
  );
  const sharedProps: SharedDialogActions | undefined =
    sharedMode && workspaceId !== null
      ? {
          workspaceId,
          onApply: sharedActions.applyShared,
          onDelete: (row) => sharedActions.deleteShared(row, agents),
          onRevert: sharedActions.revertOverride,
          onEnableAll: (row) => sharedActions.enableForAll(row, agents),
          onPromote: sharedActions.promoteToShared,
        }
      : undefined;
  const editing = nav.editing;

  return (
    <>
      {editing ? (
        <SkillEditorPage
          key={editing.slug}
          row={editing}
          agents={agents}
          onApply={actions.applySkillChanges}
          onDeleteEverywhere={actions.deleteSkillEverywhere}
          shared={sharedProps}
          view={nav.view}
          onViewChange={nav.setView}
          onBack={nav.close}
          onOpenChat={
            !chat.open && editing.agents.length > 0
              ? () => chat.openForSkill(editing)
              : undefined
          }
        />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {listHeader}
          <div
            data-integrations-section="skills"
            className="flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          >
            <PageContainer width="wide" className="pt-6 pb-10">
              <div className={cn("mx-auto w-full", CATALOG_PLANE_MAX_W)}>
                {agents.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t("global.noAgentsTitle")}</EmptyTitle>
                      <EmptyDescription>
                        {t("global.noAgentsDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : loading && rows.length === 0 ? (
                  <div className="flex items-center gap-2 text-ink-muted text-sm">
                    <Spinner className="size-3.5" />
                    {t("grid.loading")}
                  </div>
                ) : (
                  <SkillsReady
                    query={query}
                    onQueryChange={setQuery}
                    onCreateWithAi={chat.startCreate}
                    installed={installed}
                    installedCount={installedCount}
                  />
                )}
              </div>
            </PageContainer>
          </div>
        </div>
      )}
      {chat.node}
    </>
  );
}
