/**
 * Steps 3 to 5 of "From a friend": keep or leave behind the package's skills,
 * routines and learnings.
 *
 * One component for all three because they are the same screen with a different
 * list — the wizard skips whichever kinds the package does not carry, so the
 * step ids are already filtered by the time this renders.
 */

import type { PortableUploadPreviewResponse } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import { PickListStep } from "./pick-list-step";
import type { ImportSelection } from "./use-import-package";
import type { PickStepId } from "./use-import-wizard";
import { humanize } from "./wizard-parts";

export function ImportPickStep({
  step,
  uploaded,
  selection,
  onSelectionChange,
  findingsForId,
}: {
  step: PickStepId;
  uploaded: PortableUploadPreviewResponse;
  selection: ImportSelection;
  onSelectionChange: (next: ImportSelection) => void;
  /** Threat-scan findings for one item; empty when the scan was declined. */
  findingsForId: (kind: string, id: string) => unknown[];
}) {
  const { t } = useTranslation("portable");
  const labels = {
    selectAll: t("import.actions.selectAll"),
    clearAll: t("import.actions.clearAll"),
    flagged: t("import.flagged"),
  };

  if (step === "skills") {
    return (
      <PickListStep
        title={t("import.step3.title")}
        body={t("import.step3.body")}
        items={uploaded.preview.skills}
        selected={selection.skillSlugs}
        setSelected={(next) =>
          onSelectionChange({ ...selection, skillSlugs: next })
        }
        getId={(s) => s.slug}
        renderRow={(s) => ({
          title: s.description || humanize(s.slug),
          subtitle: humanize(s.slug),
          flagged: findingsForId("skill", s.slug).length > 0,
        })}
        labels={labels}
      />
    );
  }

  if (step === "routines") {
    return (
      <PickListStep
        title={t("import.step4.title")}
        body={t("import.step4.body")}
        items={uploaded.preview.routines}
        selected={selection.routineIds}
        setSelected={(next) =>
          onSelectionChange({ ...selection, routineIds: next })
        }
        getId={(r) => r.id}
        renderRow={(r) => ({
          title: r.name,
          subtitle: r.promptExcerpt,
          flagged: findingsForId("routine", r.id).length > 0,
        })}
        labels={labels}
      />
    );
  }

  return (
    <PickListStep
      title={t("import.step5.title")}
      body={t("import.step5.body")}
      items={uploaded.preview.learnings}
      selected={selection.learningIds}
      setSelected={(next) =>
        onSelectionChange({ ...selection, learningIds: next })
      }
      getId={(l) => l.id}
      renderRow={(l) => ({
        title: l.text,
        flagged: findingsForId("learning", l.id).length > 0,
      })}
      labels={labels}
    />
  );
}
