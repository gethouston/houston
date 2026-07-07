import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localizeSkillCopy } from "../lib/localize-skill-copy";
import type { SkillSummary } from "../lib/types";
import { SkillIcon } from "./skill-icon";

interface Props {
  skill: SkillSummary;
  /** The owning agent's configId — keys first-party skill translations. */
  configId?: string;
  onCancel: () => void;
}

export function SelectedSkillChip({ skill, configId, onCancel }: Props) {
  const { t } = useTranslation("board");
  const copy = localizeSkillCopy(skill, configId, t);

  return (
    <div className="flex w-full items-start gap-2 rounded-2xl bg-secondary/70 px-2.5 py-2 text-left">
      <SkillIcon
        image={skill.image}
        bubbleClassName="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-input"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {copy.title}
            </div>
            {copy.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {copy.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("selectedSkill.cancel")}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
