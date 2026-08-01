import { Stepper, type StepperStep } from "@houston-ai/core";
import { useState } from "react";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** Publishing an agent to the store — the flow this component was built for. */
const steps: StepperStep[] = [
  { id: "describe", label: "Describe" },
  { id: "connect", label: "Connect" },
  { id: "test", label: "Test run" },
  { id: "publish", label: "Publish" },
];

const rail = "w-full max-w-md";

/** A live stepper: completed and current steps are clickable, pending are not. */
function InteractiveStepper() {
  const [active, setActive] = useState("test");
  const reached = steps.findIndex((step) => step.id === active);

  return (
    <Stepper
      className={rail}
      steps={steps}
      activeStep={active}
      completedSteps={steps.slice(0, reached).map((step) => step.id)}
      onStepClick={setActive}
    />
  );
}

const props: SpecimenProp[] = [
  {
    name: "steps",
    type: "StepperStep[]",
    note: "{ id, label } in order. The connector is drawn between them.",
  },
  {
    name: "activeStep",
    type: "string | null",
    note: "Id of the current step, or null when none is current.",
  },
  {
    name: "completedSteps",
    type: "string[]",
    note: "Ids already done. Defaults to []. Wins over activeStep on the same id.",
  },
  {
    name: "onStepClick",
    type: "(stepId: string) => void",
    note: "Omit and every step is inert. Only done/active steps are clickable.",
  },
  { name: "className", type: "string", note: "Merged onto the rail." },
];

const tokens = [
  "bg-action",
  "text-action-text",
  "border-line",
  "bg-line",
  "bg-input",
  "text-ink",
  "text-ink-muted",
];

function StepperSpecimen() {
  return (
    <SpecimenPage
      title="Stepper"
      intro="A horizontal progress rail for a short, ordered flow — publishing an agent, connecting a provider."
    >
      <SpecimenSection
        title="Variants"
        note="None: the component takes no variant prop. Its whole appearance is derived from where the flow stands."
      >
        <SpecimenRow label="At the start">
          <Stepper className={rail} steps={steps} activeStep="describe" />
        </SpecimenRow>
        <SpecimenRow label="Mid-flow">
          <Stepper
            className={rail}
            steps={steps}
            activeStep="test"
            completedSteps={["describe", "connect"]}
          />
        </SpecimenRow>
        <SpecimenRow label="Finished">
          <Stepper
            className={rail}
            steps={steps}
            activeStep={null}
            completedSteps={steps.map((step) => step.id)}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Each step resolves to one of three: done (check on the accent), active (accent, pulsing), pending (hollow, hairline ring). The connector into a pending step goes dashed."
      >
        <SpecimenRow label="done · active · pending">
          <Stepper
            className={rail}
            steps={steps}
            activeStep="connect"
            completedSteps={["describe"]}
          />
        </SpecimenRow>
        <SpecimenRow label="Clickable (onStepClick)">
          <InteractiveStepper />
        </SpecimenRow>
        <SpecimenRow label="Read-only (no onStepClick)">
          <Stepper
            className={rail}
            steps={steps}
            activeStep="publish"
            completedSteps={["describe", "connect", "test"]}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens classes={tokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["Stepper"];

export const specimen: Specimen = {
  id: "core-stepper",
  title: "Stepper",
  group: "Structure & nav",
  render: () => <StepperSpecimen />,
};
