import { FlowChoiceList, FlowChoiceRow } from "@houston-ai/core";
import { Bot, Calendar, FolderPlus, PenLine, Users } from "lucide-react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

const props: SpecimenProp[] = [
  {
    name: "icon",
    type: "ReactNode",
    note: "Required. A bare Lucide glyph, rendered at 20px in the row's muted ink.",
  },
  {
    name: "title",
    type: "string",
    note: "Required. What the choice makes, in the user's words.",
  },
  {
    name: "onClick",
    type: "() => void",
    note: "Required. Pressing the row IS the answer — no radio beside it.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "Dims the row and drops its pointer events.",
  },
  {
    name: "dataAttrs",
    type: `Record<\`data-\${string}\`, string>`,
    note: "Hooks for e2e and the product tour. Never styling.",
  },
  {
    name: "FlowChoiceList.children",
    type: "ReactNode",
    note: "The rows. One column at every width, a small gap between them.",
  },
];

function FlowChoiceRowSpecimen() {
  return (
    <SpecimenPage
      title="FlowChoiceRow"
      intro="One answer to what am I making: a rectangular button carrying its glyph and its title, nothing else."
    >
      <SpecimenSection
        title="The list"
        note="One column at every width. Rows read in the order they were written, and the hover wash bleeds past the text edge onto the dialog's padding."
      >
        <SpecimenRow label="Two choices">
          <div className="w-full max-w-md">
            <FlowChoiceList>
              <FlowChoiceRow
                icon={<PenLine />}
                title="Start from scratch"
                onClick={() => undefined}
              />
              <FlowChoiceRow
                icon={<Bot />}
                title="Copy an agent"
                onClick={() => undefined}
              />
            </FlowChoiceList>
          </div>
        </SpecimenRow>
        <SpecimenRow label="Four choices">
          <div className="w-full max-w-md">
            <FlowChoiceList>
              <FlowChoiceRow
                icon={<Bot />}
                title="Agent"
                onClick={() => undefined}
              />
              <FlowChoiceRow
                icon={<Users />}
                title="Team"
                onClick={() => undefined}
              />
              <FlowChoiceRow
                icon={<Calendar />}
                title="Routine"
                onClick={() => undefined}
              />
              <FlowChoiceRow
                icon={<FolderPlus />}
                title="Skill"
                onClick={() => undefined}
              />
            </FlowChoiceList>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Hover one: the whole row washes at once and settles back under the press. Nothing is drawn per choice until the pointer is on it."
      >
        <SpecimenRow label="Title only">
          <div className="w-full max-w-md">
            <FlowChoiceList>
              <FlowChoiceRow
                icon={<PenLine />}
                title="Start from scratch"
                onClick={() => undefined}
              />
            </FlowChoiceList>
          </div>
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <div className="w-full max-w-md">
            <FlowChoiceList>
              <FlowChoiceRow
                icon={<Users />}
                title="Invite your team"
                onClick={() => undefined}
                disabled
              />
            </FlowChoiceList>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-hover",
          "border-line",
          "text-ink",
          "text-ink-muted",
          "ring-focus",
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
export const sources: string[] = ["FlowChoiceRow", "FlowChoiceList"];

export const specimen: Specimen = {
  id: "core-flow-choice-row",
  title: "FlowChoiceRow",
  group: "Overlays",
  render: () => <FlowChoiceRowSpecimen />,
};
