import { CatalogSearchField, CatalogShell, Spinner } from "@houston-ai/core";
import { AddSkillDialog } from "@houston-ai/skills";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInstalledSkillsStrip } from "./installed-skills-strip";
import { useSkillDiscoveryTabs } from "./skill-discovery-tabs";
import { SkillEditorDialogs } from "./skill-editor-dialogs";
import type { SkillsContentProps } from "./skills-content-props";
import { useSkillDialogLabels } from "./use-skill-surface-labels";
import { useSkillsChatSurface } from "./use-skills-chat-surface";

/** Approximate size of the skills.sh store, shown verbatim on the Available chip
 * (the store is async with no cheap total, so we label the ballpark). */
const SKILL_STORE_SIZE_LABEL = "9000+";

/**
 * The Skills tab body in the shared catalog grammar (the same layout as the
 * Integrations surfaces, minus a page header — the tab label carries that):
 * ONE search field on top drives everything, over the consolidated **Your
 * skills** strip of installed-skill tiles (a tile opens the edit modal, whose
 * footer carries the delete), then the **Available** discovery area via
 * {@link CatalogShell} — the **Store** tab (the skills.sh marketplace, its
 * category picker kept) and **Custom skills** (an empty state for now: the
 * explanation + the Add CTA opening the GitHub / From-scratch dialog). The one
 * query filters the strip AND the store; a strip with no matches is dropped.
 * Read-only mode (managed agent, non-manager) drops the tabs entirely and keeps
 * just the strip.
 *
 * HOU-791: a skill's primary surface is its persistent setup CHAT (the
 * Automations-tab experience) — a row click opens it inline in place of the
 * catalog, `useSkillsChatSurface` owns the lifecycle, and the raw-markdown
 * modal stays reachable via the chat header's "Edit manually" (and stays the
 * row behavior in read-only mode).
 */
export function SkillsContent({
  agent,
  skills,
  loading,
  readOnly = false,
  editingSkillName,
  editorState,
  onEditSkill,
  onCloseEdit,
  onSaveEditing,
  onDeleteSkill,
  editModalLabels,
  deleteConfirm,
  onSearch,
  onInstallCommunity,
  onPreviewCommunity,
  onListFromRepo,
  onInstallFromRepo,
  onCreateFromScratch,
  installedSkillNames,
}: SkillsContentProps) {
  const { t } = useTranslation("skills");
  const dialogLabels = useSkillDialogLabels();
  const [tab, setTab] = useState("store");
  const [dialogOpen, setDialogOpen] = useState(false);
  // The ONE page search: it filters the installed strip AND drives the Store.
  const [query, setQuery] = useState("");
  // The chat layer (HOU-791): a row click opens the skill's setup chat; the
  // modal stays the read-only fallback + the chat's Edit-manually target.
  const chat = useSkillsChatSurface({ agent, skills, readOnly, onEditSkill });
  const { sorted, installedCount, installed } = useInstalledSkillsStrip(
    skills,
    chat.openRow,
    query,
  );
  const editingSkill = sorted.find((s) => s.name === editingSkillName) ?? null;
  const addDialogProps =
    !readOnly && onCreateFromScratch
      ? {
          onListFromRepo,
          onInstallFromRepo,
          onCreateFromScratch,
          installedSkillNames,
        }
      : null;
  const tabs = useSkillDiscoveryTabs({
    showCustom: addDialogProps !== null,
    onAddClick: () => setDialogOpen(true),
    onCreateWithAi: chat.startCreate,
    drafts: chat.drafts,
    onResumeDraft: chat.resumeDraft,
    onDiscardDraft: chat.discardDraft,
    query,
    onQueryChange: setQuery,
    // Read-only mode never offers the Store either: no community callbacks.
    onSearch: readOnly ? undefined : onSearch,
    onInstallCommunity: readOnly ? undefined : onInstallCommunity,
    onPreviewCommunity,
    installedSkillNames,
  });

  // Read-only surfaces render zero tabs, so an active search that matches no
  // installed skill would leave nothing at all under the search box — a blank
  // void. This note keeps the search field anchored to a visible result.
  const noInstalledMatches =
    tabs.length === 0 && query.trim() !== "" && installedCount === 0;

  if (loading && sorted.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner className="size-3.5" />
        {t("grid.loading")}
      </div>
    );
  }

  return (
    <>
      {/* An open setup chat owns the section (HOU-791): the catalog steps
          aside so the conversation gets the room, and closing the chat
          returns it. The dialogs below stay mounted — the chat header's
          Edit-manually opens the modal over the chat. */}
      {chat.chatNode}
      {!chat.chatNode && (
        <>
          <CatalogShell
            controls={
              (tabs.length > 0 || sorted.length > 0) && (
                <CatalogSearchField
                  value={query}
                  onChange={setQuery}
                  label={t("grid.searchSkills")}
                />
              )
            }
            installedTitle={t("grid.yourSkillsHeading")}
            installedCount={installedCount}
            installed={installed}
            availableTitle={t("grid.availableHeading")}
            // The store-size label belongs to the Store tab only; on Custom
            // the chip would contradict the visible content.
            availableCount={
              tab === "store" ? SKILL_STORE_SIZE_LABEL : undefined
            }
            tabs={tabs}
            value={tab}
            onValueChange={setTab}
          />
          {noInstalledMatches && (
            <p className="text-[13px] text-ink-muted">
              {t("grid.noMatchingSkills")}
            </p>
          )}
        </>
      )}
      {addDialogProps && (
        <AddSkillDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          {...addDialogProps}
          labels={dialogLabels}
        />
      )}
      <SkillEditorDialogs
        editingSkill={editingSkill}
        editorState={editorState}
        readOnly={readOnly}
        onCloseEdit={onCloseEdit}
        onSaveEditing={onSaveEditing}
        onDeleteSkill={onDeleteSkill}
        editModalLabels={editModalLabels}
        deleteConfirm={deleteConfirm}
      />
    </>
  );
}
