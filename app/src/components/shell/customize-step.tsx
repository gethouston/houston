import type { FormEvent } from "react";
import { useRef } from "react";
import { EditableEmployeeCard } from "../employee-card/editable-employee-card";
import { useEmployeeNameSuggester } from "../employee-card/use-employee-name";
import type { CreateAgentFlow } from "./use-create-agent-flow";

/**
 * The last step of a hire: the new AI Employee's own card, centred, to name
 * and color. The card already carries the job and the industry the two
 * questions before it answered, each still open to a change on its own line,
 * so the screen asks for nothing else, and what it asks for is the frame's own
 * title.
 *
 * The action is the frame's bottom bar, which submits this form by `formId`,
 * so Enter in the name and a press on the bar are the same submit. A submit
 * the name holds back puts the person back in the field, with the card saying
 * why.
 */
export function CustomizeStep({
  flow,
  formId,
}: {
  flow: CreateAgentFlow;
  formId: string;
}) {
  const suggest = useEmployeeNameSuggester();
  const nameField = useRef<HTMLInputElement>(null);
  const role = flow.roleState.roleLabel.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (flow.submit() === "invalid") nameField.current?.focus();
  };

  return (
    <form id={formId} onSubmit={submit} className="flex justify-center">
      <EditableEmployeeCard
        layout="solo"
        role={role}
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
          onSuggest: () =>
            flow.onNameChange(
              suggest({ role, current: flow.name, taken: flow.takenNames }),
            ),
          inputRef: nameField,
          autoFocus: true,
        }}
      />
    </form>
  );
}
