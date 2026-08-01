import { Textarea } from "@houston-ai/core";
import type { ReactNode } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** The textarea is `w-full`; this is the form column it normally sits in. */
function Field({ children }: { children: ReactNode }) {
  return <div className="w-80 max-w-full">{children}</div>;
}

const INSTRUCTIONS =
  "Every morning at 08:00, read the overnight mail, archive the newsletters, and draft a reply for anything from a customer. Never send without my approval.";

const props: readonly SpecimenProp[] = [
  {
    name: "placeholder",
    type: "string",
    note: "Renders in `ink-muted`.",
  },
  {
    name: "rows",
    type: "number",
    note: "Sets the starting height. It still grows with the content past that.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "50% opacity and `cursor-not-allowed`.",
  },
  {
    name: "aria-invalid",
    type: "boolean",
    note: "Danger border plus a danger focus ring.",
  },
  {
    name: "...props",
    type: 'React.ComponentProps<"textarea">',
    note: "`value`, `defaultValue`, `onChange`, `name`, `maxLength`: all native.",
  },
];

const tokens = [
  "border-line-input",
  "placeholder:text-ink-muted",
  "focus-visible:border-focus",
  "ring-focus",
  "aria-invalid:border-danger",
  "ring-danger",
  "dark:bg-line-input/30",
];

function TextareaSpecimen() {
  return (
    <SpecimenPage
      title="Textarea"
      intro="The multi-line field. It sizes to its content as you type, so there is no scrollbar inside a four-line answer and no resize handle to hunt for."
    >
      <SpecimenSection
        title="Variants"
        note="No variant prop: one field, one look. What differs between uses is the starting height and whether it is allowed to grow."
      >
        <SpecimenRow label="Default (min 64px)">
          <Field>
            <Textarea
              placeholder="What should this agent do?"
              aria-label="Instructions"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Grown to fit">
          <Field>
            <Textarea defaultValue={INSTRUCTIONS} aria-label="Instructions" />
          </Field>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Type into any of these: the field grows a line at a time rather than scrolling. Focus takes the 3px near-ink ring, not a blue one."
      >
        <SpecimenRow label="Placeholder">
          <Field>
            <Textarea
              placeholder="e.g. Summarise the standup and file the follow-ups."
              aria-label="Instructions"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Filled">
          <Field>
            <Textarea
              defaultValue="Summarise the standup and file the follow-ups."
              aria-label="Instructions"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Read-only">
          <Field>
            <Textarea
              readOnly
              defaultValue={INSTRUCTIONS}
              aria-label="Published instructions"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <Field>
            <Textarea
              disabled
              defaultValue="Summarise the standup and file the follow-ups."
              aria-label="Instructions"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Invalid">
          <Field>
            <Textarea aria-invalid defaultValue="" aria-label="Instructions" />
          </Field>
          <span className="text-danger text-sm">
            Tell the agent what to do before you publish it.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="`rows` sets where it starts; the content decides where it ends up. There is no size prop."
      >
        <SpecimenRow label="rows={2}">
          <Field>
            <Textarea
              rows={2}
              placeholder="One-line summary for the store"
              aria-label="Summary"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="rows={6}">
          <Field>
            <Textarea
              rows={6}
              placeholder="Full instructions"
              aria-label="Instructions"
            />
          </Field>
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
export const sources: string[] = ["Textarea"];

export const specimen: Specimen = {
  id: "core-textarea",
  title: "Textarea",
  group: "Actions & inputs",
  render: () => <TextareaSpecimen />,
};
