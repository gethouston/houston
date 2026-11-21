import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { NamingStep } from "../shell/naming-step";
import {
  InstructionsStep,
  RoutinesStep,
  SkillsStep,
} from "./copy-content-steps";
import { SourceAgentStep } from "./source-agent-step";
import type { CopyAgentWizardState } from "./use-copy-agent-wizard";

export function CopyAgentWizard({
  w,
  formId,
}: {
  w: CopyAgentWizardState;
  formId: string;
}) {
  const { t } = useTranslation("agents");

  if (w.step === "name" && w.source) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void w.submit();
    };
    return (
      <NamingStep
        formId={formId}
        heading={t("copyAgent.wizard.name.heading", { name: w.source.name })}
        name={w.name}
        color={w.color}
        error={w.nameIssueMessage}
        nameInvalid={w.nameIssue !== null}
        onNameChange={w.setName}
        onColorChange={w.setColor}
        onSubmit={submit}
      />
    );
  }

  if (w.step === "source") {
    return (
      <SourceAgentStep
        agents={w.sources}
        loadingId={w.loadingId}
        onPick={(agent) => void w.pick(agent)}
      />
    );
  }

  if (!w.source || !w.preview || !w.selection) return null;
  const stepProps = {
    sourceName: w.source.name,
    preview: w.preview,
    selection: w.selection,
    setSelection: w.setSelection,
  };

  return (
    <>
      {w.step === "instructions" && (
        <InstructionsStep
          {...stepProps}
          copyChats={w.copyChats}
          chatCount={w.chatCount}
          onCopyChatsChange={w.setCopyChats}
        />
      )}
      {w.step === "routines" && <RoutinesStep {...stepProps} />}
      {w.step === "skills" && <SkillsStep {...stepProps} />}
    </>
  );
}
