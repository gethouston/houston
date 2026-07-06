import type { TemplateSummary } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { templateSummaryParts } from "../../lib/template-summary";
import { SkillCard } from "../skill-card";

interface CreateFromTemplatePickerProps {
  /** The org's templates, newest first. Assumed non-empty by the caller. */
  templates: TemplateSummary[];
  /** Id of the template currently being stamped into an agent, or null. */
  creatingId: string | null;
  /** Create a new agent from the chosen template. */
  onSelect: (id: string) => void;
}

/**
 * The "Start from a template" section of the new-agent picker (Teams v2). Lists
 * the org's templates as cards with a plain-language summary ("3 skills · Claude
 * · 2 apps"); picking one stamps out an agent. Multiplayer + owner/admin only —
 * the caller gates rendering on a non-empty template list, so single-player and
 * self-host never see it.
 */
export function CreateFromTemplatePicker({
  templates,
  creatingId,
  onSelect,
}: CreateFromTemplatePickerProps) {
  const { t } = useTranslation("teams");
  const creating = creatingId !== null;

  return (
    <div className="shrink-0 px-6 pb-5 border-b border-border/50">
      <h3 className="text-sm font-medium text-foreground mb-3">
        {t("templates.pickerTitle")}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((tpl) => {
          const isCreating = creatingId === tpl.id;
          return (
            <SkillCard
              key={tpl.id}
              image="memo"
              title={tpl.name}
              description={
                isCreating
                  ? t("templates.settingUp")
                  : tpl.description || undefined
              }
              footer={isCreating ? undefined : summaryLine(tpl, t)}
              busy={isCreating}
              disabled={creating && !isCreating}
              onClick={() => onSelect(tpl.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** The middot-joined summary: skills · model brand · apps. */
function summaryLine(
  tpl: TemplateSummary,
  t: ReturnType<typeof useTranslation<"teams">>["t"],
) {
  const parts = templateSummaryParts(tpl);
  const pieces = [t("templates.summary.skills", { count: parts.skillCount })];
  if (parts.model) pieces.push(parts.model);
  pieces.push(
    parts.allApps
      ? t("templates.summary.allApps")
      : t("templates.summary.apps", { count: parts.appCount ?? 0 }),
  );
  return (
    <span className="text-[11px] text-muted-foreground">
      {pieces.join(" · ")}
    </span>
  );
}
