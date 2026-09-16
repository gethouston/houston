/**
 * Import an agent a friend shared — the "From a friend" flow.
 *
 *   1. Upload + optional threat scan.
 *   2. Name + colour + model (helmet preview).
 *   3-5. Skills / Routines / Learnings pickers, each present only when the
 *        package actually carries that kind.
 *
 * The frame is `FlowSheet`, which owns the surface, the header and the
 * scrolling body: steps render bare content, and Back lives in the header's
 * leading slot at every step but the first — where the close X is the only way
 * out, so the flow never offers two ways to leave in one row.
 *
 * The first two steps ask one short thing each, so they wear the compact
 * frame and state themselves in its title; the pickers are lists to scan, and
 * take the tall one with their own headline over the list.
 */

import { AsyncButton, Button, FlowSheet } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { ImportNameStep } from "./import-name-step";
import { ImportPickStep } from "./import-pick-steps";
import { ImportUploadStep } from "./import-upload-step";
import { useImportWizard } from "./use-import-wizard";
import { ProgressDots } from "./wizard-parts";

export function ImportAgentWizard() {
  const { t } = useTranslation(["portable", "common"]);
  const wizard = useImportWizard();

  if (!wizard.open) return null;

  const { currentStep, pkg } = wizard;
  const compact = currentStep === "upload" || currentStep === "name";

  return (
    <FlowSheet
      open
      onOpenChange={(next) => {
        if (!next) wizard.close();
      }}
      size={compact ? "compact" : "wide"}
      title={
        currentStep === "upload"
          ? t("portable:import.step1.title")
          : currentStep === "name"
            ? t("portable:import.step2.title")
            : t("portable:import.eyebrow")
      }
      back={
        wizard.stepIndex > 0
          ? {
              label: t("portable:import.actions.back"),
              onClick: wizard.goBack,
            }
          : undefined
      }
      progress={
        <ProgressDots index={wizard.stepIndex} total={wizard.stepCount} />
      }
      labels={{ close: t("common:actions.close") }}
      footer={
        <div className="flex items-center justify-end">
          {wizard.isLast ? (
            // The button's own label is the pending affordance, so AsyncButton's
            // spinner stays off; what it adds is holding the press for the whole
            // round-trip.
            <AsyncButton onClick={wizard.install} spinner={false}>
              {wizard.installing
                ? t("portable:import.actions.installing")
                : t("portable:import.actions.install")}
            </AsyncButton>
          ) : (
            <Button onClick={wizard.goNext} disabled={!wizard.canAdvance}>
              {t("portable:import.actions.next")}
            </Button>
          )}
        </div>
      }
    >
      {currentStep === "upload" && (
        <ImportUploadStep
          uploaded={pkg.uploaded}
          wantScan={pkg.wantScan}
          onChooseScan={pkg.chooseScan}
          onPick={pkg.pickFile}
          scanning={pkg.scanning}
          scan={pkg.scan}
        />
      )}
      {currentStep === "name" && (
        <ImportNameStep
          name={wizard.name}
          onNameChange={wizard.setName}
          color={wizard.color}
          onColorChange={wizard.setColor}
          provider={wizard.providerModel.provider}
          model={wizard.providerModel.model}
          onProviderChange={wizard.providerModel.onProviderChange}
          onAdvance={() => {
            if (wizard.canAdvance) wizard.goNext();
          }}
        />
      )}
      {currentStep !== "upload" && currentStep !== "name" && pkg.uploaded && (
        <ImportPickStep
          step={currentStep}
          uploaded={pkg.uploaded}
          selection={pkg.selection}
          onSelectionChange={pkg.setSelection}
          findingsForId={pkg.findingsForId}
        />
      )}
    </FlowSheet>
  );
}
