import {
  AGENT_COLORS,
  HoustonAvatar,
  Input,
  resolveAgentColor,
} from "@houston-ai/core";
import { type FormEvent, type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EmployeeColorPalette } from "../employee-card/employee-color-palette";

export interface AgentIdentityFormProps {
  formId: string;
  header: ReactNode;
  name: string;
  color: string | undefined;
  error: string | null;
  nameInvalid?: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}

const AVATAR_COLOR_FADE =
  "transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] [&_svg]:transition-colors [&_svg]:duration-200 [&_svg]:ease-[cubic-bezier(0.16,1,0.3,1)]";

export function AgentIdentityForm({
  formId,
  header,
  name,
  color,
  error,
  nameInvalid,
  onNameChange,
  onColorChange,
  onSubmit,
}: AgentIdentityFormProps) {
  const { t } = useTranslation("shell");
  const resolvedColor = resolveAgentColor(color);

  useEffect(() => {
    if (!color) {
      onColorChange(AGENT_COLORS[0].id);
    }
  }, [color, onColorChange]);

  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <HoustonAvatar
        color={resolvedColor}
        diameter={64}
        className={AVATAR_COLOR_FADE}
      />
      {header}

      <div className="@container flex w-full max-w-sm flex-col gap-6">
        <EmployeeColorPalette
          className="self-center"
          color={color}
          onColorChange={onColorChange}
        />

        <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("employeeCard.namePlaceholder")}
            aria-label={t("naming.dialogTitle")}
            aria-invalid={nameInvalid || undefined}
            className="h-11 rounded-full px-4 text-center md:h-10"
          />

          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
