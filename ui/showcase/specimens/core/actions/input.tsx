import { Input } from "@houston-ai/core";
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

/**
 * The field is `w-full` by design, so it takes the width of whatever lays it
 * out. This rail gives it a realistic form column instead of the page.
 */
function Field({ children }: { children: ReactNode }) {
  return <div className="w-72 max-w-full">{children}</div>;
}

const props: readonly SpecimenProp[] = [
  {
    name: "type",
    type: "React.HTMLInputTypeAttribute",
    note: "Passed straight to the native input; `file` gets its own button styling.",
  },
  {
    name: "placeholder",
    type: "string",
    note: "Renders in `ink-muted`. Never a substitute for a label.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "50% opacity, `cursor-not-allowed`, no pointer events.",
  },
  {
    name: "readOnly",
    type: "boolean",
    note: "Stays fully legible and selectable, because copy is the point.",
  },
  {
    name: "aria-invalid",
    type: "boolean",
    note: "The only error affordance the field itself carries.",
  },
  {
    name: "...props",
    type: 'React.ComponentProps<"input">',
    note: "`value`, `defaultValue`, `onChange`, `name`: all native.",
  },
];

const tokens = [
  "border-line-input",
  "text-ink",
  "placeholder:text-ink-muted",
  "selection:bg-action",
  "selection:text-action-text",
  "file:text-ink",
  "focus:border-focus",
  "aria-invalid:border-danger",
  "aria-invalid:ring-danger",
  "dark:bg-line-input/30",
];

function InputSpecimen() {
  return (
    <SpecimenPage
      title="Input"
      intro="The single-line field: 36px tall, 16px text so mobile never zooms, and a border that resolves the focus token rather than a blue default."
    >
      <SpecimenSection
        title="Variants"
        note="There is no `variant` prop. The field has one look. What changes it is the native `type`, which decides the keyboard and the built-in affordances."
      >
        <SpecimenRow label="text">
          <Field>
            <Input
              type="text"
              defaultValue="Inbox Zero"
              aria-label="Agent name"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="email">
          <Field>
            <Input
              type="email"
              defaultValue="julian@gethouston.ai"
              aria-label="Notify"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="password">
          <Field>
            <Input
              type="password"
              defaultValue="sk-live-houston"
              aria-label="API key"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="search">
          <Field>
            <Input
              type="search"
              placeholder="Search agents"
              aria-label="Search"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="number">
          <Field>
            <Input
              type="number"
              defaultValue={15}
              aria-label="Run every (minutes)"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="file">
          <Field>
            <Input type="file" aria-label="Agent icon" />
          </Field>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Focus is live: click into a field. Selection inside it inverts to the action token, so a highlighted value reads as deliberate rather than as the browser's blue."
      >
        <SpecimenRow label="Placeholder">
          <Field>
            <Input placeholder="e.g. Meeting Notes" aria-label="Agent name" />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Filled">
          <Field>
            <Input defaultValue="Meeting Notes" aria-label="Agent name" />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Read-only">
          <Field>
            <Input
              readOnly
              defaultValue="agents.gethouston.ai/meeting-notes"
              aria-label="Public link"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <Field>
            <Input
              disabled
              defaultValue="Meeting Notes"
              aria-label="Agent name"
            />
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Invalid">
          <Field>
            <Input
              aria-invalid
              defaultValue="meeting notes!"
              aria-label="Agent handle"
            />
          </Field>
          <span className="text-danger text-sm">
            Handles are lowercase, letters and dashes only.
          </span>
        </SpecimenRow>
        <SpecimenRow label="Full width">
          <div className="w-full">
            <Input
              placeholder="Takes the width of its column"
              aria-label="Wide"
            />
          </div>
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
export const sources: string[] = ["Input"];

export const specimen: Specimen = {
  id: "core-input",
  title: "Input",
  group: "Actions & inputs",
  render: () => <InputSpecimen />,
};
