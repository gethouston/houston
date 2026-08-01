import { Switch } from "@houston-ai/core";
import { useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** A switch as it actually ships: a label you can click, and live state. */
function SettingRow({
  id,
  label,
  hint,
  initial = false,
}: {
  id: string;
  label: string;
  hint?: string;
  initial?: boolean;
}) {
  const [on, setOn] = useState(initial);
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={on} onCheckedChange={setOn} />
      <label htmlFor={id} className="flex flex-col text-sm">
        <span className="text-ink">{label}</span>
        {hint ? <span className="text-ink-muted text-xs">{hint}</span> : null}
      </label>
    </div>
  );
}

const props: readonly SpecimenProp[] = [
  {
    name: "checked / defaultChecked",
    type: "boolean",
    note: "Controlled or uncontrolled, with `onCheckedChange` for both.",
  },
  {
    name: "onCheckedChange",
    type: "(checked: boolean) => void",
    note: "Fires on click, Space and Enter.",
  },
  {
    name: "size",
    type: '"sm" | "default"',
    note: "Defaults to `default`. `sm` is for dense rows, not for touch targets.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "50% opacity, `cursor-not-allowed`.",
  },
  {
    name: "id",
    type: "string",
    note: "Pair it with a `<label htmlFor>`; the switch itself carries no text.",
  },
  {
    name: "...props",
    type: "React.ComponentProps<typeof SwitchPrimitive.Root>",
    note: "`name`, `value`, `required` for form submission.",
  },
];

const tokens = [
  "bg-action",
  "bg-line-input",
  "bg-input",
  "dark:bg-action-text",
  "dark:bg-ink",
  "border-focus",
  "ring-focus",
];

function SwitchSpecimen() {
  return (
    <SpecimenPage
      title="Switch"
      intro="An immediate on/off. It commits the moment it moves, so never pair one with a Save button."
    >
      <SpecimenSection
        title="Variants"
        note="There is no `variant` prop: on and off are the whole vocabulary. Off is the field-border grey, on is the action fill, the same accent as a primary button."
      >
        <SpecimenRow label="Off">
          <Switch aria-label="Run automatically" />
        </SpecimenRow>
        <SpecimenRow label="On">
          <Switch defaultChecked aria-label="Run automatically" />
        </SpecimenRow>
        <SpecimenRow label="With a label (live)">
          <SettingRow
            id="switch-auto-run"
            label="Run Inbox Zero automatically"
            hint="Every morning at 08:00."
            initial
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Tab to one: the focus ring resolves the near-ink focus token and follows the pill's radius. Disabled keeps its position so the current setting is still readable."
      >
        <SpecimenRow label="Default">
          <SettingRow
            id="switch-notify"
            label="Notify me when a run fails"
            initial
          />
        </SpecimenRow>
        <SpecimenRow label="Disabled, off">
          <div className="flex items-center gap-3">
            <Switch id="switch-locked-off" disabled />
            <label
              htmlFor="switch-locked-off"
              className="text-ink-muted text-sm"
            >
              Share with the workspace (needs an admin)
            </label>
          </div>
        </SpecimenRow>
        <SpecimenRow label="Disabled, on">
          <div className="flex items-center gap-3">
            <Switch id="switch-locked-on" disabled defaultChecked />
            <label
              htmlFor="switch-locked-on"
              className="text-ink-muted text-sm"
            >
              Keep run history (required on your plan)
            </label>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="`default` is the settings-row size. `sm` exists for dense inline controls, but it is below the 24px hit target, so give it a clickable label."
      >
        <SpecimenRow label="default">
          <Switch aria-label="Run automatically" />
          <Switch defaultChecked aria-label="Run automatically, on" />
        </SpecimenRow>
        <SpecimenRow label="sm">
          <Switch size="sm" aria-label="Run automatically" />
          <Switch size="sm" defaultChecked aria-label="Run automatically, on" />
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
export const sources: string[] = ["Switch"];

export const specimen: Specimen = {
  id: "core-switch",
  title: "Switch",
  group: "Actions & inputs",
  render: () => <SwitchSpecimen />,
};
