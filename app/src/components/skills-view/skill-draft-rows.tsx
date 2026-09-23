import type { Activity } from "@houston/engine-adapter";
import { skillDraftLastWorkedAt } from "@houston/sdk/skill-drafts";
import { CatalogGrid, CatalogRow } from "@houston-ai/core";
import { ChevronRight, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";

/**
 * The creation chats this AI Employee started and never finished: its own
 * band above the skills, in the same row grammar. A draft is not one of the
 * skills — it stands outside their heading and their count — and the chat is
 * the only thing that exists yet, so the row opens it rather than an editor
 * over a skill that is not there.
 *
 * Every unfinished chat is titled the same until the skill has a name, so the
 * row carries WHEN it was last worked on: that is the only thing that tells two
 * abandoned chats apart.
 */
export function SkillDraftRows({
  drafts,
  onOpen,
}: {
  drafts: Activity[];
  /** Reopen this chat in the panel beside the list. */
  onOpen: (activityId: string) => void;
}) {
  const { t, i18n } = useTranslation("skills");
  if (drafts.length === 0) return null;

  const describe = (draft: Activity) => {
    const at = skillDraftLastWorkedAt(draft);
    return at === null
      ? t("setupChat.draftInProgress")
      : t("setupChat.draftInProgressAt", {
          when: formatRelativeTime(at, i18n.language),
        });
  };

  return (
    <section className="mb-8">
      <CatalogGrid>
        {drafts.map((draft) => (
          <CatalogRow
            key={draft.id}
            icon={
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-line-input text-ink-muted">
                <MessageCircle className="size-5" />
              </span>
            }
            title={t("global.unfinishedDraft", {
              title: draft.title || t("setupChat.missionTitle"),
            })}
            description={describe(draft)}
            trailing={
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-ink-muted"
              />
            }
            onClick={() => onOpen(draft.id)}
          />
        ))}
      </CatalogGrid>
    </section>
  );
}
