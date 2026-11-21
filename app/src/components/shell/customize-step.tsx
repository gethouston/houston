import type { FormEvent } from "react";
import { useEffect, useRef } from "react";
import { isMobileViewport } from "../../lib/viewport";
import { EditableEmployeeCard } from "../employee-card/editable-employee-card";
import type { CreateAgentFlow } from "./use-create-agent-flow";

const primaryOf = (form: HTMLFormElement | null) =>
  Array.from(form?.elements ?? []).find(
    (element): element is HTMLButtonElement =>
      element instanceof HTMLButtonElement && element.type === "submit",
  );

export function CustomizeStep({
  flow,
  formId,
}: {
  flow: CreateAgentFlow;
  formId: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMobileViewport()) return;
    primaryOf(form.current)?.focus({ preventScroll: true });
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (flow.submit() === "invalid") nameField.current?.focus();
  };

  return (
    <form
      ref={form}
      id={formId}
      onSubmit={submit}
      className="flex flex-col items-center"
    >
      <EditableEmployeeCard
        layout="solo"
        role={flow.roleState.roleLabel.trim()}
        industry={flow.roleState.contextLabel.trim()}
        status="draft"
        color={flow.color}
        onColorChange={flow.onColorChange}
        onBriefChange={flow.roleState.answerBrief}
        message={flow.message}
        invalid={flow.nameInvalid}
        name={{
          value: flow.name,
          onChange: flow.onNameChange,
          inputRef: nameField,
        }}
      />
    </form>
  );
}
