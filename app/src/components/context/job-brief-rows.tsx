import { cn } from "@houston-ai/core";
import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AGENT_CONTEXT_IDS,
  type AgentContextId,
} from "../../lib/agent-role-catalog";
import { SettingsCard, SettingsControlRow } from "../settings/settings-row";
import { choiceIdForLabel, type JobBriefField } from "./job-brief-model";
import { JobBriefPicker } from "./job-brief-picker";

function JobBriefValue({
  value,
  placeholder,
  changeLabel,
  onOpen,
}: {
  value: string | null;
  placeholder: string;
  changeLabel: (answer: string) => string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={value ?? undefined}
      aria-label={value ? changeLabel(value) : undefined}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-2 rounded-full",
        "border border-line-input bg-input px-4 text-sm font-medium text-ink",
        "transition-colors hover:bg-hover hover:text-hover-text",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        "md:min-h-0 md:w-auto md:max-w-56 md:justify-start md:py-1.5",
      )}
    >
      <span className={cn("truncate", !value && "text-ink-muted")}>
        {value ?? placeholder}
      </span>
      <ChevronDown className="size-4 shrink-0 text-ink-muted" />
    </button>
  );
}

interface BriefRow {
  id: JobBriefField;
  icon: LucideIcon;
  label: string;
  value: string | null;
  placeholder: string;
  changeLabel: (answer: string) => string;
}

export function JobBriefRows({
  industry,
  role,
  onChange,
}: {
  industry: string | null;
  role: string | null;
  onChange: (field: JobBriefField, answer: string) => void;
}) {
  const { t } = useTranslation(["agents", "agentOnboarding"]);
  const [picking, setPicking] = useState<JobBriefField | null>(null);
  const industryId: AgentContextId | null = choiceIdForLabel(
    AGENT_CONTEXT_IDS,
    (id) => t(`agentOnboarding:roleSetup.contexts.${id}`),
    industry,
  );

  const rows: BriefRow[] = [
    {
      id: "industry",
      icon: Building2,
      label: t("agents:instructions.brief.industry"),
      value: industry,
      placeholder: t("agents:instructions.brief.addIndustry"),
      changeLabel: (answer) =>
        t("agentOnboarding:roleSetup.customize.changeIndustry", { answer }),
    },
    {
      id: "role",
      icon: BriefcaseBusiness,
      label: t("agents:instructions.brief.role"),
      value: role,
      placeholder: t("agents:instructions.brief.addRole"),
      changeLabel: (answer) =>
        t("agentOnboarding:roleSetup.customize.changeRole", { answer }),
    },
  ];

  return (
    <>
      <SettingsCard>
        {rows.map((row) => (
          <SettingsControlRow
            key={row.id}
            stack
            icon={row.icon}
            title={row.label}
          >
            <JobBriefValue
              value={row.value}
              placeholder={row.placeholder}
              changeLabel={row.changeLabel}
              onOpen={() => setPicking(row.id)}
            />
          </SettingsControlRow>
        ))}
      </SettingsCard>
      {picking && (
        <JobBriefPicker
          field={picking}
          current={picking === "industry" ? industry : role}
          industryId={industryId}
          onClose={() => setPicking(null)}
          onPick={(answer) => onChange(picking, answer)}
        />
      )}
    </>
  );
}
