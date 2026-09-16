import type { SkillStepIntegration } from "@houston-ai/skills";
import {
  humanizeIntegrationAction,
  SkillWorkflowSteps,
} from "@houston-ai/skills";
import type { LucideIcon } from "lucide-react";
import { Blocks, FolderOpen, Mail, Table } from "lucide-react";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { houstonSkillPreview } from "./sample";

const steps = houstonSkillPreview.workflow ?? [];

/**
 * What `app/` passes for `renderIntegration`: the Composio toolkit slug
 * resolved to the app's real name and mark. An app the catalog doesn't know
 * still chips, on the slug alone.
 */
const APPS: Record<string, { name: string; icon: LucideIcon }> = {
  gmail: { name: "Gmail", icon: Mail },
  googlesheets: { name: "Google Sheets", icon: Table },
  googledrive: { name: "Google Drive", icon: FolderOpen },
};

function renderIntegration(integration: SkillStepIntegration) {
  const app = APPS[integration.toolkit];
  const Icon = app?.icon ?? Blocks;
  const action = humanizeIntegrationAction(
    integration.toolkit,
    integration.action,
  );
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-chip px-2 py-0.5 text-chip-text text-xs">
      <Icon className="size-4 shrink-0" />
      <span className="break-words">
        {action
          ? `${app?.name ?? integration.toolkit} · ${action}`
          : (app?.name ?? integration.toolkit)}
      </span>
    </span>
  );
}

function SkillWorkflowStepsSpecimen() {
  return (
    <SpecimenPage
      title="Skill workflow steps"
      intro="A skill Houston wrote, read as the procedure it is: an index chip, the short action, the app that action runs on, and the detail underneath. An imported skill has no parsed steps, so nothing renders and its raw instructions stay the body."
    >
      <SpecimenSection
        title="Anatomy"
        note="The panel is a recessed plane, not a card: it sits inside the skill dialog and the preview modal, both of which already float."
      >
        <SpecimenRow label="Full procedure">
          <div className="w-full max-w-lg">
            <SkillWorkflowSteps steps={steps} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Titles only">
          <div className="w-full max-w-lg">
            <SkillWorkflowSteps
              steps={steps.map((step) => ({ ...step, detail: null }))}
            />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Apps resolved (what the app passes)">
          <div className="w-full max-w-lg">
            <SkillWorkflowSteps
              steps={steps}
              renderIntegration={renderIntegration}
            />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Translated heading">
          <div className="w-full max-w-lg">
            <SkillWorkflowSteps
              steps={steps.slice(0, 2)}
              labels={{ heading: "Flujo de trabajo" }}
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Edges"
        note="Real SKILL.md steps are written by agents: a title can run long and a detail can carry its own nested lines. Both wrap; neither scrolls the panel sideways."
      >
        <SpecimenRow label="App chip under a long title">
          <div className="w-full max-w-xs">
            <SkillWorkflowSteps
              steps={[
                {
                  title: "Send the founder the close package for review",
                  detail: null,
                  integration: {
                    toolkit: "gmail",
                    action: "GMAIL_SEND_EMAIL",
                  },
                },
              ]}
              renderIntegration={renderIntegration}
            />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Long title, nested detail">
          <div className="w-full max-w-xs">
            <SkillWorkflowSteps
              steps={[
                {
                  title:
                    "Draft every pending standard journal entry for the period",
                  detail:
                    "• Reversals of last month's accruals.\n• New accruals from the register.\n• Prepaid amortization.",
                  integration: { toolkit: "quickbooks", action: null },
                },
              ]}
            />
          </div>
        </SpecimenRow>
        <SpecimenRow label="No steps">
          <p className="text-ink-muted text-[13px]">
            Renders nothing — an imported skill shows its instructions instead.
          </p>
          <SkillWorkflowSteps steps={[]} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "steps",
            type: "SkillWorkflowStepItem[]",
            note: "Required. The parsed procedure; an empty list renders nothing at all.",
          },
          {
            name: "renderIntegration",
            type: "(integration: SkillStepIntegration) => ReactNode",
            note: "Draws the app a step acts on, as a chip on the title row. Owned by `app/` (a slug resolves to a name and logo through the Composio catalog); omitted, the step chips the slug plus `humanizeIntegrationAction` of its action.",
          },
          {
            name: "labels",
            type: "{ heading?: string }",
            note: "English defaults; the app passes its t() copy (ui/ stays i18n-agnostic).",
          },
          {
            name: "className",
            type: "string",
            note: "Extra classes on the panel.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-chip-subtle",
          "bg-chip",
          "text-chip-text",
          "bg-input",
          "text-ink",
          "text-ink-muted",
          "rounded-xl",
          "tabular-nums",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "SkillWorkflowSteps",
  "humanizeIntegrationAction",
];

export const specimen: Specimen = {
  id: "skills-workflow-steps",
  title: "Skill workflow steps",
  group: "Skills",
  render: () => <SkillWorkflowStepsSpecimen />,
};
