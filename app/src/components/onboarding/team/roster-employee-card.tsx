import { useTranslation } from "react-i18next";
import { EditableEmployeeCard } from "../../employee-card/editable-employee-card";
import { type RosterPatch, rosterBriefPatch } from "./team-roster-edit";
import type { RosterMember } from "./team-roster-model";
import { useRosterNameField } from "./use-roster-name-field";

export function RosterEmployeeCard({
  member,
  takenNames,
  onEdit,
  onRetry,
  onRemove,
}: {
  member: RosterMember;
  takenNames: readonly string[];
  onEdit: (patch: RosterPatch) => void;
  onRetry: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation(["agentOnboarding", "agents"]);
  const field = useRosterNameField(member, takenNames, (name) =>
    onEdit({ name }),
  );
  const { status } = member;
  const failure =
    status.kind === "failed"
      ? status.reason === "nameTaken"
        ? t("agents:toasts.nameConflict", { name: member.name })
        : t("agentOnboarding:roleSetup.createFailed")
      : member.saveFailed
        ? t("agentOnboarding:roleSetup.saveFailed")
        : null;

  return (
    <EditableEmployeeCard
      layout="grid"
      role={member.brief.role}
      industry={member.brief.context}
      status={status.kind}
      color={member.color}
      onColorChange={(color) => onEdit({ color })}
      onBriefChange={(field, answer) => {
        const patch = rosterBriefPatch(member, field, answer);
        if (patch) onEdit(patch);
      }}
      message={field.error ?? failure}
      invalid={field.error !== null}
      recovery={{ name: member.name, onRetry, onRemove }}
      name={{
        value: field.value,
        onChange: field.onChange,
        onBlur: field.onBlur,
        onKeyDown: field.onKeyDown,
      }}
    />
  );
}
