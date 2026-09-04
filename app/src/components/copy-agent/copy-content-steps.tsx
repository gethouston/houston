import type { PortableInventoryPreview } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { WizardSelection } from "../../lib/portable-share";
import { PickListStep, PickSwitchRow } from "../portable/pick-list-step";
import { humanize } from "../portable/wizard-parts";

interface ContentStepProps {
  sourceName: string;
  preview: PortableInventoryPreview;
  selection: WizardSelection;
  setSelection: (next: WizardSelection) => void;
}

function usePickLabels() {
  const { t } = useTranslation("agents");
  return {
    selectAll: t("copyAgent.wizard.actions.selectAll"),
    clearAll: t("copyAgent.wizard.actions.clearAll"),
    flagged: "",
  };
}

/**
 * "What should the copy know?": the job description as one switch, then the
 * learnings one by one. Both default ON; the user opts things out.
 */
export function InstructionsStep({
  sourceName,
  preview,
  selection,
  setSelection,
}: ContentStepProps) {
  const { t } = useTranslation("agents");
  const labels = usePickLabels();
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight text-balance">
          {t("copyAgent.wizard.instructions.title")}
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          {t("copyAgent.wizard.instructions.body")}
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium">
          {t("copyAgent.wizard.instructions.instructionsLabel")}
        </h2>
        {preview.claudeMd ? (
          <PickSwitchRow
            checked={selection.claudeMd}
            onChange={() =>
              setSelection({ ...selection, claudeMd: !selection.claudeMd })
            }
            title={t("copyAgent.wizard.instructions.instructionsRow")}
            subtitle={preview.claudeMd.excerpt}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            {t("copyAgent.wizard.instructions.noInstructions", {
              name: sourceName,
            })}
          </p>
        )}
      </section>

      {preview.learnings.length > 0 && (
        <PickListStep
          title={t("copyAgent.wizard.instructions.learningsLabel")}
          body={t("copyAgent.wizard.instructions.learningsBody")}
          items={preview.learnings}
          selected={selection.learningIds}
          setSelected={(next) =>
            setSelection({ ...selection, learningIds: next })
          }
          getId={(learning) => learning.id}
          renderRow={(learning) => ({ title: learning.text })}
          labels={labels}
          compact
        />
      )}
    </div>
  );
}

export function RoutinesStep({
  sourceName,
  preview,
  selection,
  setSelection,
}: ContentStepProps) {
  const { t } = useTranslation("agents");
  return (
    <PickListStep
      title={t("copyAgent.wizard.routines.title")}
      body={t("copyAgent.wizard.routines.body", { name: sourceName })}
      items={preview.routines}
      selected={selection.routineIds}
      setSelected={(next) => setSelection({ ...selection, routineIds: next })}
      getId={(routine) => routine.id}
      renderRow={(routine) => ({
        title: routine.name,
        subtitle: routine.promptExcerpt,
      })}
      labels={usePickLabels()}
    />
  );
}

export function SkillsStep({
  sourceName,
  preview,
  selection,
  setSelection,
}: ContentStepProps) {
  const { t } = useTranslation("agents");
  return (
    <PickListStep
      title={t("copyAgent.wizard.skills.title")}
      body={t("copyAgent.wizard.skills.body", { name: sourceName })}
      items={preview.skills}
      selected={selection.skillSlugs}
      setSelected={(next) => setSelection({ ...selection, skillSlugs: next })}
      getId={(skill) => skill.slug}
      renderRow={(skill) => ({
        title: humanize(skill.slug),
        subtitle: skill.description,
      })}
      labels={usePickLabels()}
    />
  );
}
