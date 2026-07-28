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
import type { CommunitySkill } from "@houston-ai/skills";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { useAgentStore } from "../../stores/agents";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { InstallSkillDialog } from "./install-skill-dialog";
import { ManageSkillDialog } from "./manage-skill-dialog";
import { NewSkillDialog } from "./new-skill-dialog";
import { useGlobalStoreTab } from "./use-global-store-tab";
import { useSkillsViewActions } from "./use-skills-view-actions";
import { useWorkspaceSkills } from "./use-workspace-skills";
import { useWorkspaceSkillRows } from "./workspace-skill-rows";

/** A marketplace install waiting on the pick-agents dialog. */
interface PendingInstall {
  skill: CommunitySkill;
  resolve: (slug: string) => void;
  reject: (err: unknown) => void;
}

/** Approximate skills.sh size, shown on the Available chip (async store, no
 *  cheap total — same label the per-agent tab shows). */
const SKILL_STORE_SIZE_LABEL = "9000+";

/**
 * The top-level Skills page (sidebar "Skills", HOU-792): one place to see and
 * manage skills across every agent in the workspace. Skills still live ON each
 * agent — this surface aggregates the per-agent lists and fans installs,
 * creates, edits and removals out to the picked agents through the existing
 * agent-scoped routes (no shared store, nothing new server-side).
 */
export function SkillsView() {
  const { t } = useTranslation("skills");
  const agents = useAgentStore((s) => s.agents);
  const { rows, installedSkillNames, listsByPath, loading } =
    useWorkspaceSkills(agents);
  const actions = useSkillsViewActions();

  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState<WorkspaceSkillRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(
    null,
  );

  const hasSkill = useCallback(
    (agent: Agent, slug: string) =>
      (listsByPath.get(agent.folderPath) ?? []).some((s) => s.name === slug),
    [listsByPath],
  );

  // The marketplace card hands us the install click as a promise; park it
  // behind the pick-agents dialog and settle it with the fan-out's outcome
  // (a cancel rejects — the card quietly re-enables, nothing toasts).
  const handleInstall = useCallback(
    (skill: CommunitySkill) =>
      new Promise<string>((resolve, reject) => {
        setPendingInstall({ skill, resolve, reject });
      }),
    [],
  );

  const { installed, installedCount } = useWorkspaceSkillRows(
    rows,
    query,
    setManaging,
  );
  const tabs = useGlobalStoreTab({
    browsePath: agents[0]?.folderPath,
    query,
    onQueryChange: setQuery,
    onInstall: handleInstall,
    installedSkillNames,
  });

  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="flex flex-col gap-6 py-10">
        <PageHeader
          title={t("global.pageTitle")}
          subtitle={t("global.pageSubtitle")}
          trailing={
            agents.length > 0 ? (
              <Button type="button" onClick={() => setCreating(true)}>
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
            availableCount={SKILL_STORE_SIZE_LABEL}
            tabs={tabs}
          />
        )}
      </PageContainer>
      <ManageSkillDialog
        row={managing}
        agents={agents}
        onApply={actions.applySkillChanges}
        onDeleteEverywhere={actions.deleteSkillEverywhere}
        onClose={() => setManaging(null)}
      />
      <NewSkillDialog
        open={creating}
        onOpenChange={setCreating}
        agents={agents}
        hasSkill={hasSkill}
        onCreate={actions.createForAgents}
      />
      <InstallSkillDialog
        skill={pendingInstall?.skill ?? null}
        agents={agents}
        hasSkill={hasSkill}
        onConfirm={async (targets) => {
          const pending = pendingInstall;
          if (!pending) return;
          try {
            pending.resolve(
              await actions.installToAgents(pending.skill, targets),
            );
          } catch (err) {
            // Failure toasts already fired inside the fan-out; rejecting only
            // re-enables the marketplace card.
            pending.reject(err);
          }
          setPendingInstall(null);
        }}
        onCancel={() => {
          pendingInstall?.reject(new Error("install canceled"));
          setPendingInstall(null);
        }}
      />
    </div>
  );
}
