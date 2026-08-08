import {
  Button,
  CatalogSearchField,
  CatalogShell,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { type ManagedSkillRow, ManageSkillDialog } from "./manage-skill-dialog";
import { NewSkillDialog } from "./new-skill-dialog";
import { useGlobalChatFlow } from "./use-global-chat-flow";
import { useGlobalInstallFlow } from "./use-global-install-flow";
import { useGlobalSkillTabs } from "./use-global-skill-tabs";
import { useSharedSkills } from "./use-shared-skills";
import { useSharedSkillsActions } from "./use-shared-skills-actions";
import { useSkillsViewActions } from "./use-skills-view-actions";
import { useWorkspaceSkills } from "./use-workspace-skills";
import { useWorkspaceSkillRows } from "./workspace-skill-rows";

/** Approximate skills.sh size, shown on the Available chip (async store, no
 *  cheap total — same label the agent's Skills section shows). */
const SKILL_STORE_SIZE_LABEL = "9000+";

/**
 * The top-level Skills page (sidebar "Skills", HOU-792): one place to see and
 * manage skills across every agent in the workspace. On deployments that
 * serve the workspace-shared store (`capabilities.sharedSkills`, ADR 0003)
 * a skill lives ONCE in the store, agents enable it via their manifest, and
 * an agent's modified copy shadows it as an override. Everywhere else the
 * copy-based HOU-792 model stays: per-agent lists aggregated, installs and
 * edits fanned out through the agent-scoped routes. "New skill" opens the
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
  const [tab, setTab] = useState("store");
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
  const tabs = useGlobalSkillTabs({
    browsePath: agents[0]?.folderPath,
    query,
    onQueryChange: setQuery,
    onInstall: install.handleInstallCommunity,
    installedSkillNames,
    custom: {
      onCreateWithAi: chat.startCreate,
      onAddClick: () => setCreating(true),
    },
  });

  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="flex flex-col gap-6 py-10">
        <PageHeader
          title={t("global.pageTitle")}
          subtitle={t("global.pageSubtitle")}
          trailing={
            agents.length > 0 ? (
              <Button type="button" onClick={chat.startCreate}>
                <Plus className="size-4" />
                {t("global.newSkill")}
              </Button>
            ) : undefined
          }
        />
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
          <CatalogShell
            controls={
              <CatalogSearchField
                value={query}
                onChange={setQuery}
                label={t("grid.searchSkills")}
              />
            }
            installedTitle={t("grid.yourSkillsHeading")}
            installedCount={installedCount}
            installed={installed}
            availableTitle={t("grid.availableHeading")}
            // The store-size label belongs to the Store tab only.
            availableCount={
              tab === "store" ? SKILL_STORE_SIZE_LABEL : undefined
            }
            tabs={tabs}
            value={tab}
            onValueChange={setTab}
          />
        )}
      </PageContainer>
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
    </div>
  );
}
