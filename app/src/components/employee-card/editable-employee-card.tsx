import { type KeyboardEvent, type Ref, useId } from "react";
import { useTranslation } from "react-i18next";
import type { JobBriefField } from "../context/job-brief-model";
import { EmployeeBriefLine } from "./employee-brief-line";
import { EmployeeCard } from "./employee-card";
import type { EmployeeCardRecovery } from "./employee-card-foot";
import type {
  EmployeeCardLayout,
  EmployeeCardStatus,
} from "./employee-card-model";
import { EmployeeCardUnit } from "./employee-card-unit";
import { EmployeeNameField } from "./employee-name-field";

/** The card's name field, as its owner drives it. */
export interface EmployeeCardNameInput {
  value: string;
  onChange: (value: string) => void;
  onSuggest: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
}

export function EditableEmployeeCard({
  layout,
  role,
  industry,
  status,
  color,
  name,
  message,
  invalid,
  recovery,
  onColorChange,
  onBriefChange,
}: {
  layout: EmployeeCardLayout;
  role: string;
  industry: string;
  status: EmployeeCardStatus;
  color: string | undefined;
  name: EmployeeCardNameInput;
  message: string | null;
  /** The name holds the card back, with an explanation beside the field. */
  invalid: boolean;
  recovery?: EmployeeCardRecovery;
  onColorChange: (color: string) => void;
  /** The job or the industry answered again, as the person reads it. */
  onBriefChange: (field: JobBriefField, answer: string) => void;
}) {
  const { t } = useTranslation("shell");
  const messageId = useId();
  const who = name.value.trim() || role;

  return (
    <EmployeeCardUnit
      layout={layout}
      label={who}
      card={
        <EmployeeCard
          color={color}
          role={role}
          onColorChange={onColorChange}
          brief={
            <>
              <EmployeeBriefLine
                field="role"
                value={role}
                industry={industry}
                onAnswer={(answer) => onBriefChange("role", answer)}
              />
              <EmployeeBriefLine
                field="industry"
                value={industry}
                industry={industry}
                onAnswer={(answer) => onBriefChange("industry", answer)}
              />
            </>
          }
          status={status}
          message={{ id: messageId, text: message }}
          recovery={recovery}
          name={
            <EmployeeNameField
              {...name}
              label={t("employeeCard.nameLabel", { role })}
              role={role}
              invalid={invalid}
              describedBy={messageId}
            />
          }
        />
      }
    />
  );
}
