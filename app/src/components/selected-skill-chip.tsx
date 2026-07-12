import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../lib/humanize-skill-name";
import type { SkillSummary } from "../lib/types";
import { SkillIcon } from "./skill-icon";

interface Props {
  skill: SkillSummary;
  onCancel: () => void;
}

export function SelectedSkillChip({ skill, onCancel }: Props) {
  const { t } = useTranslation("board");

  return (
    <div className="flex w-full items-start gap-2 rounded-2xl bg-chip/70 px-2.5 py-2 text-left">
      <SkillIcon
        image={skill.image}
        bubbleClassName="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-line-input"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">
              {skillDisplayTitle(skill)}
            </div>
            {skill.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
                {skill.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("selectedSkill.cancel")}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
