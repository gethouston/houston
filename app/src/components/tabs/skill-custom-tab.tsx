import { Button, CatalogGrid, CatalogRow } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { Plus, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { OtherAgentSkills } from "./other-agent-skills";

interface Props {
  /** The agent the library installs into (and whose drafts these are). */
  agent: Agent;
  /** Unclaimed create-chats — each resumes right where the interview left off. */
  drafts: Activity[];
  onResumeDraft: (activityId: string) => void;
  onDiscardDraft: (activityId: string) => void;
  /** Start a new agent-guided create chat (HOU-791, the primary path). */
  onCreateWithAi: () => void;
  /** Open the manual GitHub / from-scratch dialog (the secondary path). */
  onAddClick: () => void;
  /** Installed slugs — library rows show a quiet check instead of an add. */
  installedSkillNames?: Set<string>;
}

/**
 * The Custom skills tab — the user's SOURCES of skills: build one with the
 * agent (primary), add one manually (GitHub / from scratch), resume an
 * unfinished create-chat, or copy a skill living on another of their agents.
 */
export function SkillCustomTab({
  agent,
  drafts,
  onResumeDraft,
  onDiscardDraft,
  onCreateWithAi,
  onAddClick,
  installedSkillNames,
}: Props) {
  const { t } = useTranslation("skills");

  return (
    <div className="flex flex-col gap-6">
      {drafts.length > 0 && (
        <CatalogGrid>
          {drafts.map((draft) => (
            <CatalogRow
              key={draft.id}
              icon={
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input">
                  <Sparkles aria-hidden className="size-5 text-ink-muted" />
                </span>
              }
              title={draft.title}
              description={t("setupChat.draftInProgress")}
              trailing={
                <button
                  type="button"
                  aria-label={t("setupChat.discardDraft")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscardDraft(draft.id);
                  }}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              }
              onClick={() => onResumeDraft(draft.id)}
            />
          ))}
        </CatalogGrid>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          {t("tabs.customEmptyDescription")}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onCreateWithAi}>
            {t("tabs.createSkill")}
          </Button>
          <Button type="button" variant="outline" onClick={onAddClick}>
            <Plus className="size-4" />
            {t("grid.addSkill")}
          </Button>
        </div>
      </div>

      {/* The user's own skills living on OTHER agents (HOU-792) — one click
          copies a skill built for Agent A onto this agent. */}
      <OtherAgentSkills
        agent={agent}
        installedSkillNames={installedSkillNames}
      />
    </div>
  );
}
