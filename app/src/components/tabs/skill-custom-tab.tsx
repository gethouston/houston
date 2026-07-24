import {
  Button,
  CatalogGrid,
  CatalogRow,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { Plus, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  /** Unclaimed create-chats — each resumes right where the interview left off. */
  drafts: Activity[];
  onResumeDraft: (activityId: string) => void;
  onDiscardDraft: (activityId: string) => void;
  /** Start a new agent-guided create chat (HOU-791, the primary path). */
  onCreateWithAi: () => void;
  /** Open the manual GitHub / from-scratch dialog (the secondary path). */
  onAddClick: () => void;
}

/**
 * The Custom skills tab: build-with-the-agent first (HOU-791). Unfinished
 * create-chats show as resumable rows (with an always-visible discard, no
 * hover-gating); under them — or as the empty state's own actions — the
 * primary "Create with AI" CTA and the manual add dialog as the quiet
 * secondary path.
 */
export function SkillCustomTab({
  drafts,
  onResumeDraft,
  onDiscardDraft,
  onCreateWithAi,
  onAddClick,
}: Props) {
  const { t } = useTranslation("skills");

  const actions = (
    <div className="flex items-center gap-2">
      <Button type="button" onClick={onCreateWithAi}>
        <Sparkles className="size-4" />
        {t("tabs.createWithAi")}
      </Button>
      <Button type="button" variant="outline" onClick={onAddClick}>
        <Plus className="size-4" />
        {t("grid.addSkill")}
      </Button>
    </div>
  );

  if (drafts.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle className="text-lg">
            {t("tabs.customEmptyTitle")}
          </EmptyTitle>
          <EmptyDescription>
            {t("tabs.customEmptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
        {actions}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
      <div>{actions}</div>
    </div>
  );
}
