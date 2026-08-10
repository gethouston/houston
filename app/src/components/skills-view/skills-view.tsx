import {
  CATALOG_PLANE_MAX_W,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { PageContainer } from "../shell/page-shell";
import { type ManagedSkillRow, ManageSkillDialog } from "./manage-skill-dialog";
import { NewSkillDialog } from "./new-skill-dialog";
import { SKILLS_HEADER_THRESHOLDS, SkillsHeader } from "./skills-header";
import { SkillsReady } from "./skills-ready";
import { useGlobalChatFlow } from "./use-global-chat-flow";
import { useGlobalInstallFlow } from "./use-global-install-flow";
import { useSharedSkills } from "./use-shared-skills";
import { useSharedSkillsActions } from "./use-shared-skills-actions";
import { useSkillsViewActions } from "./use-skills-view-actions";
import { useStoreTabContent } from "./use-store-tab-content";
import { useWorkspaceSkills } from "./use-workspace-skills";
import { useWorkspaceSkillRows } from "./workspace-skill-rows";

/** Approximate skills.sh size, shown on the Available chip (async store, no
 *  cheap total — same label the agent's Skills section shows). */
const SKILL_STORE_SIZE_LABEL = "9000+";

/**
 * The top-level Skills page (sidebar "Skills", HOU-792): one place to see and
 * manage skills across every agent in the workspace. A shared deployment
 * stores a skill once and agents enable it; elsewhere installs and edits fan
 * out through agent-scoped routes. "New skill" opens the
 * guided create chat in the shell's right-hand panel (the Routines split)
 * while this page stays on the left.
 */
export function SkillsView() {
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
  const installedSkillNames = useMemo(
    () =>
      sharedMode
        ? new Set(rows.map((row) => row.slug.toLowerCase()))
        : copyModel.installedSkillNames,
    [sharedMode, rows, copyModel.installedSkillNames],
  );

  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState<ManagedSkillRow | null>(null);
  const [creating, setCreating] = useState(false);

  const hasSkill = useCallback(
    (agent: Agent, slug: string) =>
      (listsByPath.get(agent.folderPath) ?? []).some((s) => s.name === slug) ||
      (sharedMode &&
        rows.some(
          (row) =>
            row.slug === slug && row.agents.some((a) => a.id === agent.id),
        )),
    [listsByPath, sharedMode, rows],
  );

  // The chat's "Edit manually" targets the freshly claimed skill; its row may
  // still be settling into the aggregate, so a miss is a quiet no-op (the row
  // click covers it once the list refreshes).
  const openManageBySlug = useCallback(
    (slug: string) => {
      const row = rows.find((r) => r.slug === slug);
      if (row) setManaging(row);
    },
    [rows],
  );

  const chat = useGlobalChatFlow({
    agents,
    listsByPath,
    onEditSkill: openManageBySlug,
  });
  const install = useGlobalInstallFlow({ agents, hasSkill, actions });

  const { installed, installedCount } = useWorkspaceSkillRows(
    rows,
    query,
    setManaging,
  );
  const storeTab = useStoreTabContent({
    browsePath: agents[0]?.folderPath,
    query,
    onQueryChange: setQuery,
    onInstall: install.handleInstallCommunity,
    installedSkillNames,
  });

  return (
    <PageHeaderToolsProvider thresholds={SKILLS_HEADER_THRESHOLDS}>
      <div className="flex h-full flex-col">
        <SkillsHeader />
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
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
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <Spinner className="size-3.5" />
                  {t("grid.loading")}
                </div>
              ) : (
                <SkillsReady
                  query={query}
                  onQueryChange={setQuery}
                  onCreateWithAi={chat.startCreate}
                  onAddManually={() => setCreating(true)}
                  installed={installed}
                  installedCount={installedCount}
                  storeTab={storeTab}
                  storeSizeLabel={SKILL_STORE_SIZE_LABEL}
                />
              )}
            </div>
          </PageContainer>
        </div>
      </div>
      {chat.node}
      {install.dialogNode}
      <ManageSkillDialog
        row={managing}
        agents={agents}
        onApply={actions.applySkillChanges}
        onDeleteEverywhere={actions.deleteSkillEverywhere}
        onClose={() => setManaging(null)}
        onEditInChat={chat.openForSkill}
        shared={
          sharedMode && workspaceId !== null
            ? {
                workspaceId,
                onApply: sharedActions.applyShared,
                onDelete: (row) => sharedActions.deleteShared(row, agents),
                onRevert: sharedActions.revertOverride,
                onEnableAll: (row) => sharedActions.enableForAll(row, agents),
                onPromote: sharedActions.promoteToShared,
              }
            : undefined
        }
      />
      <NewSkillDialog
        open={creating}
        onOpenChange={setCreating}
        agents={agents}
        hasSkill={hasSkill}
        onCreate={
          sharedMode ? sharedActions.createShared : actions.createForAgents
        }
      />
    </PageHeaderToolsProvider>
  );
}
