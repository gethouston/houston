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
          nameError={wizard.nameIssueText}
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
