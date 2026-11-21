import { useIsMobile } from "@houston-ai/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { effectiveSkillsByPath } from "./effective-skills";
import { SkillDraftRows } from "./skill-draft-rows";
import { SkillEditorPage } from "./skill-editor-page";
import { SkillsListSkeleton, SkillsRetryEmpty } from "./skills-list-states";
import { SkillsReady } from "./skills-ready";
import { SkillsSurfaceFrame } from "./skills-surface-frame";
import { useAddExistingSkill } from "./use-add-existing-skill";
import { useScopedSkillRows } from "./use-scoped-skill-rows";
import { useSkillCreateFlow } from "./use-skill-create-flow";
import { useSkillsEditorNav } from "./use-skills-editor-nav";
import { useSkillsModels } from "./use-skills-models";
import { useSkillsViewActions } from "./use-skills-view-actions";
import { useUnfinishedSkillDrafts } from "./use-unfinished-skill-drafts";
import { useWorkspaceSkillRows } from "./workspace-skill-rows";

export function SkillsBody({ agent }: { agent: Agent }) {
  const { t } = useTranslation("skills");
  const workspaceAgents = useAgentStore((s) => s.agents);
  const agents = useMemo(() => [agent], [agent]);
  const models = useSkillsModels(agents);
  const rows = useScopedSkillRows(models.rows, models.listsByPath, agent);
  const actions = useSkillsViewActions();
  const [query, setQuery] = useState("");

  const isMobile = useIsMobile();
  const openTextRef = useRef<(slug: string) => void>(() => {});
  const onEditSkill = useCallback((slug: string) => {
    openTextRef.current(slug);
  }, []);
  const skillsByPath = useMemo(
    () =>
      effectiveSkillsByPath({
        rows: models.rows,
        listsByPath: models.listsByPath,
      }),
    [models.rows, models.listsByPath],
  );
  const create = useSkillCreateFlow({
    agent,
    skillsByPath,
    skillsFailed: models.failed,
    onEditSkill,
  });
  const addExisting = useAddExistingSkill({
    agent,
    rows: models.rows,
    shared: models.shared,
    loading: models.loading,
    failed: models.failed,
    onRetry: models.retry,
  });
  const nav = useSkillsEditorNav({
    rows,
    rowsLoaded: !models.loading,
    openChat: create.openForSkill,
    closeChat: create.close,
    autoOpenChat: !isMobile,
  });
  openTextRef.current = nav.openText;

  const { installed, installedCount } = useWorkspaceSkillRows({
    rows,
    query,
    onOpenEditor: nav.open,
  });
  const drafts = useUnfinishedSkillDrafts(
    agent,
    skillsByPath,
    create.openActivityId,
  );
  const editing = nav.editing;

  return (
    <>
      {editing ? (
        <SkillEditorPage
          key={editing.slug}
          row={editing}
          workspaceAgents={workspaceAgents}
          agent={agent}
          onApply={actions.applySkillChanges}
          onDeleteEverywhere={actions.deleteSkillEverywhere}
          shared={models.shared}
          view={nav.view}
          onViewChange={nav.setView}
          onBack={nav.close}
          onOpenChat={
            !create.open && editing.agents.length > 0
              ? () => create.openForSkill(editing)
              : undefined
          }
        />
      ) : (
        <SkillsSurfaceFrame dataAttrs={{ "data-skills-list": "agent" }}>
          {models.loading && rows.length === 0 ? (
            <SkillsListSkeleton />
          ) : models.failed && rows.length === 0 ? (
            <SkillsRetryEmpty
              title={t("global.loadFailedTitle")}
              description={t("global.loadFailedDescription")}
              onRetry={models.retry}
            />
          ) : (
            <SkillsReady
              query={query}
              onQueryChange={setQuery}
              onCreateWithChat={create.startChat}
              onAddExisting={addExisting.start}
              drafts={
                <SkillDraftRows drafts={drafts} onOpen={create.openDraft} />
              }
              installed={installed}
              installedCount={installedCount}
            />
          )}
        </SkillsSurfaceFrame>
      )}
      {create.node}
      {addExisting.node}
    </>
  );
}
