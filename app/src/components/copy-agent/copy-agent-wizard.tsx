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

/**
 * The create sheet's second door: a new agent modeled on one you already have.
 * Source list, then one screen per kind of content the source carries (job
 * description + learnings, routines, skills), each item ON by default, then the
 * same naming screen the guided setup ends on. The copy itself is the portable
 * pipeline `useCopyAgent` runs for the Settings "Copy agent" row, fed the
 * wizard's selection instead of everything.
 *
 * Only the SCREENS live here. The way back, the progress across these steps
 * and the Continue that advances them are the sheet's own header and bottom
 * bar (`add-to-workspace-sheet.tsx`) — the wizard wearing its own chrome
 * inside a frame that already has some is what made the flow feel like two
 * different products stitched together.
 */
export function CopyAgentWizard({
  w,
  formId,
}: {
  w: CopyAgentWizardState;
  /** The naming form's id, submitted from the sheet's bottom bar. */
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
