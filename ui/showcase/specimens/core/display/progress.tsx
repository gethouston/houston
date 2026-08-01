import { Progress } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function ProgressSpecimen() {
  return (
    <SpecimenPage
      title="Progress"
      intro="A determinate bar: how much of a known amount of work is done."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — one bar, in the action colour on a 20% track. The only axis is `value`."
      >
        <SpecimenRow label="value={0}">
          <Progress value={0} className="w-full max-w-sm" />
        </SpecimenRow>
        <SpecimenRow label="value={35}">
          <Progress value={35} className="w-full max-w-sm" />
        </SpecimenRow>
        <SpecimenRow label="value={72}">
          <Progress value={72} className="w-full max-w-sm" />
        </SpecimenRow>
        <SpecimenRow label="value={100}">
          <Progress value={100} className="w-full max-w-sm" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Determinate only. This wrapper coerces a missing value to 0 (`value || 0`), so an omitted `value` reads as an empty bar rather than Radix's indeterminate animation — use `Spinner` when the total is unknown."
      >
        <SpecimenRow label="No value → renders 0%">
          <Progress className="w-full max-w-sm" />
        </SpecimenRow>
        <SpecimenRow label="With a label and a count">
          <div className="flex w-full max-w-sm flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[15px] leading-[1.55] text-ink">
                Inbox Zero
              </span>
              <span className="text-[13px] leading-[1.4] text-ink-muted">
                29 of 41 emails
              </span>
            </div>
            <Progress value={71} aria-label="Emails triaged" />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Complete">
          <div className="flex w-full max-w-sm flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[15px] leading-[1.55] text-ink">
                Weekly Report
              </span>
              <span className="text-[13px] leading-[1.4] text-ink-muted">
                Done
              </span>
            </div>
            <Progress value={100} aria-label="Report progress" />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Fixed at 8px tall (`h-2`); width always comes from the parent. Override the height through `className` only when a surface genuinely needs a different weight."
      >
        <SpecimenRow label="Default height, narrow">
          <Progress value={45} className="w-40" />
        </SpecimenRow>
        <SpecimenRow label="Default height, full width">
          <Progress value={45} className="w-full max-w-sm" />
        </SpecimenRow>
        <SpecimenRow label="Slimmer (h-1)">
          <Progress value={45} className="h-1 w-full max-w-sm" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "value",
            type: "number | null | undefined",
            note: "0–100. Anything falsy renders 0%. Drives both the fill and Radix's `aria-valuenow`.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged onto the track. Width lives here.",
          },
          {
            name: "...props",
            type: "React.ComponentProps<typeof ProgressPrimitive.Root>",
            note: "Radix Progress root — `max`, `getValueLabel`, `aria-label`.",
          },
        ]}
      />

      <SpecimenTokens classes={["bg-action", "bg-action/20"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["Progress"];

export const specimen: Specimen = {
  id: "core-progress",
  title: "Progress",
  group: "Data display",
  render: () => <ProgressSpecimen />,
};
