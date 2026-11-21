import type { Activity } from "@houston/engine-adapter";
import { skillDraftLastWorkedAt } from "@houston/sdk/skill-drafts";
import { CatalogGrid, CatalogRow } from "@houston-ai/core";
import { ChevronRight, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";

export function SkillDraftRows({
  drafts,
  onOpen,
}: {
  drafts: Activity[];
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
