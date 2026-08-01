import { Separator } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function SeparatorSpecimen() {
  return (
    <SpecimenPage
      title="Separator"
      intro="A one-pixel rule on the line token — the only divider in the system."
    >
      <SpecimenSection
        title="Variants"
        note="`orientation` is the only visual axis: horizontal fills the width, vertical fills the height (so the parent must have one)."
      >
        <SpecimenRow label="horizontal (default)">
          <div className="w-full max-w-sm">
            <p className="pb-3 text-[15px] leading-[1.55] text-ink">
              Inbox Zero
            </p>
            <Separator />
            <p className="pt-3 text-[13px] leading-[1.4] text-ink-muted">
              Last run 8 minutes ago
            </p>
          </div>
        </SpecimenRow>
        <SpecimenRow label="vertical">
          <div className="flex h-5 items-center gap-3 text-[13px] leading-[1.4] text-ink-muted">
            <span>@julian</span>
            <Separator orientation="vertical" />
            <span>2.7k installs</span>
            <Separator orientation="vertical" />
            <span>Updated today</span>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note={
          '`decorative` is a semantics switch, not a visual one: true (default) hides it from assistive tech, false exposes `role="separator"` for a genuine section break.'
        }
      >
        <SpecimenRow label="decorative (default)">
          <div className="w-full max-w-sm">
            <Separator />
          </div>
        </SpecimenRow>
        <SpecimenRow label="decorative={false} — announced">
          <div className="w-full max-w-sm">
            <Separator decorative={false} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Between stacked rows">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-card px-4">
            {["Inbox Zero", "Meeting Notes", "Weekly Report"].map(
              (name, index) => (
                <div key={name}>
                  {index > 0 ? <Separator /> : null}
                  <p className="py-3 text-[15px] leading-[1.55] text-ink">
                    {name}
                  </p>
                </div>
              ),
            )}
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Fixed at one physical pixel on the cross axis; the main axis always fills the parent. Length is the parent's job, never a prop."
      >
        <SpecimenRow label="Full width vs. inset">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <Separator />
            <div className="px-8">
              <Separator />
            </div>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "orientation",
            type: '"horizontal" | "vertical"',
            note: 'Defaults to "horizontal". Vertical needs a parent with a height.',
          },
          {
            name: "decorative",
            type: "boolean",
            note: "Defaults to true — hidden from assistive tech. Set false for a semantic break.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged last; the usual use is a margin.",
          },
          {
            name: "...props",
            type: "React.ComponentProps<typeof SeparatorPrimitive.Root>",
            note: "Everything else Radix's Separator accepts.",
          },
        ]}
      />

      <SpecimenTokens classes={["bg-line"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["Separator"];

export const specimen: Specimen = {
  id: "core-separator",
  title: "Separator",
  group: "Data display",
  render: () => <SeparatorSpecimen />,
};
