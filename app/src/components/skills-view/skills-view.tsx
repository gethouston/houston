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
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { useAgentStore } from "../../stores/agents";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { ManageSkillDialog } from "./manage-skill-dialog";
import { NewSkillDialog } from "./new-skill-dialog";
import { useGlobalChatFlow } from "./use-global-chat-flow";
import { useGlobalInstallFlow } from "./use-global-install-flow";
import { useGlobalSkillTabs } from "./use-global-skill-tabs";
import { useSkillsViewActions } from "./use-skills-view-actions";
import { useWorkspaceSkills } from "./use-workspace-skills";
import { useWorkspaceSkillRows } from "./workspace-skill-rows";

/** Approximate skills.sh size, shown on the Available chip (async store, no
 *  cheap total — same label the per-agent tab shows). */
const SKILL_STORE_SIZE_LABEL = "9000+";

/**
 * The top-level Skills page (sidebar "Skills", HOU-792): one place to see and
 * manage skills across every agent in the workspace. Skills still live ON
 * each agent — this surface aggregates the per-agent lists and fans installs,
 * creates, edits and removals out to the picked agents through the existing
 * agent-scoped routes (no shared store, nothing new server-side). "New skill"
 * opens the guided create chat in the shell's right-hand panel (the Routines
 * split) while this page stays on the left.
 */
export function SkillsView() {
  const { t } = useTranslation("skills");
  const agents = useAgentStore((s) => s.agents);
  const { rows, installedSkillNames, listsByPath, loading } =
    useWorkspaceSkills(agents);
  const actions = useSkillsViewActions();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("store");
  const [managing, setManaging] = useState<WorkspaceSkillRow | null>(null);
  const [creating, setCreating] = useState(false);

  const hasSkill = useCallback(
    (agent: Agent, slug: string) =>
      (listsByPath.get(agent.folderPath) ?? []).some((s) => s.name === slug),
    [listsByPath],
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
      onInstallLibrary: install.handleInstallLibrary,
      installing: install.libraryInstalling,
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
      />
      <NewSkillDialog
        open={creating}
        onOpenChange={setCreating}
        agents={agents}
        hasSkill={hasSkill}
        onCreate={actions.createForAgents}
      />
    </div>
  );
}
