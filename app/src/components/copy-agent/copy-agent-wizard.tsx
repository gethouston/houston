import { Button, DialogTitle } from "@houston-ai/core";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ProgressDots } from "../portable/wizard-parts";
import { NamingStep } from "../shell/naming-step";
import {
  InstructionsStep,
  RoutinesStep,
  SkillsStep,
} from "./copy-content-steps";
import { SourceAgentStep } from "./source-agent-step";
import { useCopyAgentWizard } from "./use-copy-agent-wizard";

/**
 * The create dialog's third door: a new agent modeled on one you already have.
 * Source list, then one screen per kind of content the source carries (job
 * description + learnings, routines, skills), each item ON by default, then the
 * same naming screen as "Create new". The copy itself is the portable pipeline
 * `useCopyAgent` runs for the Settings "Copy agent" row, fed the wizard's
 * selection instead of everything.
 */
export function CopyAgentWizard(props: {
  /** The team the "+" was pressed in; `null` files the copy in the default. */
  targetTeamId: string | null;
  /** Leave the wizard for the dialog's first screen. */
  onBack: () => void;
  /** The copy exists: the dialog closes. */
  onDone: () => void;
}) {
  const { t } = useTranslation("agents");
  const w = useCopyAgentWizard(props);

  if (w.step === "name" && w.source) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void w.submit();
    };
    return (
      <NamingStep
        selectedAgent={undefined}
        heading={t("copyAgent.wizard.name.heading", { name: w.source.name })}
        name={w.name}
        color={w.color}
        error={w.nameIssueMessage}
        existingPath={null}
        creating={w.creating}
        nameInvalid={w.nameIssue !== null}
        onNameChange={w.setName}
        onColorChange={w.setColor}
        onExistingPathChange={() => undefined}
        onBack={w.back}
        onSubmit={submit}
      />
    );
  }

  const stepProps =
    w.source && w.preview && w.selection
      ? {
          sourceName: w.source.name,
          preview: w.preview,
          selection: w.selection,
          setSelection: w.setSelection,
        }
      : null;

  return (
    <>
      <DialogTitle className="sr-only">
        {t("copyAgent.wizard.eyebrow")}
      </DialogTitle>
      <header className="flex shrink-0 items-center gap-4 px-5 pt-6 pb-2 md:px-8">
        <p className="text-xs text-ink-muted">
          {t("copyAgent.wizard.eyebrow")}
        </p>
        <ProgressDots index={w.stepIndex} total={w.steps.length} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-6 md:px-8">
        {w.step === "source" && (
          <SourceAgentStep
            agents={w.sources}
            loadingId={w.loadingId}
            onPick={(agent) => void w.pick(agent)}
          />
        )}
        {stepProps && w.step === "instructions" && (
          <InstructionsStep {...stepProps} />
        )}
        {stepProps && w.step === "routines" && <RoutinesStep {...stepProps} />}
        {stepProps && w.step === "skills" && <SkillsStep {...stepProps} />}
      </div>
      <footer className="flex shrink-0 items-center justify-between px-5 py-4 pb-safe md:px-8">
        <button
          type="button"
          onClick={w.back}
          className="text-sm text-ink-muted hover:text-ink"
        >
          {t("copyAgent.wizard.actions.back")}
        </button>
        {w.step !== "source" && (
          <Button className="rounded-full" onClick={w.next}>
            {t("copyAgent.wizard.actions.next")}
          </Button>
        )}
      </footer>
    </>
  );
}
