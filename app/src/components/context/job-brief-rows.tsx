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

/**
 * The value seat of one fact: the answer as the file holds it, and the way to
 * change it. A pill in the row's right seat, which is where a settings row
 * keeps its current value; the chevron says a chooser opens on it.
 *
 * On a phone it takes its own full-width line under the label and stands 44px
 * tall — the height the create flow's chips stand at — so an answer the user
 * typed reads whole instead of truncating beside the label.
 */
function JobBriefValue({
  value,
  placeholder,
  changeLabel,
  onOpen,
}: {
  value: string | null;
  placeholder: string;
  /** The button's spoken name once it carries an answer. */
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

/**
 * The two facts at the head of every job description — the industry the agent
 * works in and the job it fills — as the first card of the Job description
 * form: one settings row each, label on the left, the answer on the right.
 *
 * They are the answers the user gave at creation, and they live in the file
 * the agent reads, so this card is not a form beside the document: it IS the
 * top of the document, drawn as controls because two one-line facts read
 * better as two controls than as two lines of text to re-type. Each row opens
 * the very question it was answered with ({@link JobBriefPicker}), and the
 * answer is written the moment it is picked — there is no Save here, because
 * there is nothing else on the card to save with it.
 *
 * An agent with no facts yet (an imported or older one) shows the placeholders
 * and gains the block on the first pick.
 */
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
