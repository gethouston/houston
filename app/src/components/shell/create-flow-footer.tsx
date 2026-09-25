import { AsyncButton, Button, Spinner } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CopyAgentWizardState } from "../copy-agent/use-copy-agent-wizard";
import {
  type CreateFlowStep,
  hasFlowPrimary,
} from "./create-agent-steps-model";
import type { CreateAgentFlow } from "./use-create-agent-flow";
import type { CreateTeamForm } from "./use-create-team-form";

/** The two identity forms the bottom bar submits from outside them. */
export const CREATE_AGENT_FORM_ID = "create-agent-identity";
export const COPY_AGENT_FORM_ID = "copy-agent-identity";

/**
 * The step's one action, in the sheet's bottom bar.
 *
 * ONE per screen and always in the same place, at both widths: a flow whose
 * primary is sometimes inline, sometimes pinned and sometimes sticky asks the
 * user to find the way on again at every step. Full width on a phone, where it
 * is the thumb's target, its natural size on a desktop.
 */
function CreateFlowPrimary({
  label,
  form,
  onClick,
  disabled,
  pending,
  cancel,
}: {
  label: string;
  /** Submits this form from outside it. Mutually exclusive with `onClick`. */
  form?: string;
  onClick?: () => Promise<void> | void;
  disabled?: boolean;
  pending?: boolean;
  /** The way out, beside the primary — the FormDialog footer's pair. */
  cancel?: { label: string; onClick: () => void };
}) {
  return (
    // The dialog footer's own shape: stacked on a phone with the primary on
    // top (`flex-col-reverse`), one right-aligned row from md:.
    <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
      {cancel ? (
        <Button
          type="button"
          variant="outline"
          onClick={cancel.onClick}
          className="h-11 w-full md:h-10 md:w-auto md:px-6"
        >
          {cancel.label}
        </Button>
      ) : null}
      {form ? (
        <Button
          type="submit"
          form={form}
          disabled={disabled || pending}
          className="h-11 w-full md:h-10 md:w-auto md:px-6"
        >
          {pending ? <Spinner className="size-4" /> : null}
          {label}
        </Button>
      ) : (
        <AsyncButton
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="h-11 w-full md:h-10 md:w-auto md:px-6"
        >
          {label}
        </AsyncButton>
      )}
    </div>
  );
}

/** What the bottom bar says on the screens {@link hasFlowPrimary} admits. */
export function CreateFlowFooter({
  step,
  agent,
  copy,
  team,
  onCancel,
}: {
  step: CreateFlowStep;
  agent: CreateAgentFlow;
  copy: CopyAgentWizardState;
  team: CreateTeamForm;
  /** Leaves the flow from the team form, where the pair reads as a form's. */
  onCancel: () => void;
}): ReactNode {
  const { t } = useTranslation(["shell", "teams", "agents", "common"]);

  if (step === "customize") {
    return (
      <CreateFlowPrimary
        form={CREATE_AGENT_FORM_ID}
        label={t("shell:naming.createAgent")}
        disabled={agent.submitBlocked}
        pending={agent.creating}
      />
    );
  }

  if (step === "team") {
    return (
      <CreateFlowPrimary
        label={t("teams:agentTeams.create.submit")}
        onClick={team.submit}
        disabled={!team.canSubmit}
        cancel={{ label: t("common:actions.cancel"), onClick: onCancel }}
      />
    );
  }

  if (!hasFlowPrimary(step, copy.step)) return null;

  if (copy.step === "name") {
    return (
      <CreateFlowPrimary
        form={COPY_AGENT_FORM_ID}
        label={t("shell:naming.createAgent")}
        disabled={!copy.name.trim() || copy.nameIssue !== null}
        pending={copy.creating}
      />
    );
  }

  return (
    <CreateFlowPrimary
      label={t("agents:copyAgent.wizard.actions.next")}
      onClick={copy.next}
    />
  );
}
