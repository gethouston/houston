import { Button, Spinner } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function SpinnerSpecimen() {
  return (
    <SpecimenPage
      title="Spinner"
      intro="The busy indicator: a spinning Lucide loader that inherits the text colour around it."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop. Colour is never set — it paints in `currentColor`, so it adopts whatever text colour it sits in."
      >
        <SpecimenRow label="In body text">
          <span className="inline-flex items-center gap-2 text-[15px] leading-[1.55] text-ink">
            <Spinner />
            Starting Inbox Zero
          </span>
        </SpecimenRow>
        <SpecimenRow label="In muted text">
          <span className="inline-flex items-center gap-2 text-[13px] leading-[1.4] text-ink-muted">
            <Spinner />
            Checking connection
          </span>
        </SpecimenRow>
        <SpecimenRow label="In an error message">
          <span className="inline-flex items-center gap-2 text-[13px] leading-[1.4] text-danger">
            <Spinner />
            Retrying after a failed run
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note={
          'One state — spinning — and it never stops on its own. It renders `role="status"` with the accessible name “Loading”, so it announces itself; unmount it when the work finishes.'
        }
      >
        <SpecimenRow label="Inside a button">
          <Button disabled>
            <Spinner />
            Publishing
          </Button>
          <Button variant="outline" disabled>
            <Spinner />
            Connecting Gmail
          </Button>
        </SpecimenRow>
        <SpecimenRow label="Centred in a panel">
          <div className="flex h-24 w-full max-w-sm items-center justify-center rounded-2xl border border-line bg-card text-ink-muted">
            <Spinner className="size-6" />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Beside a row that is refreshing">
          <div className="flex w-full max-w-sm items-center justify-between gap-4 rounded-2xl border border-line bg-card px-4 py-3">
            <span className="text-[15px] leading-[1.55] text-ink">
              Meeting Notes
            </span>
            <Spinner className="text-ink-muted" />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Defaults to `size-4`; anything else is a `size-*` class through `className`, which merges last."
      >
        <SpecimenRow label="size-4 (default)">
          <Spinner className="text-ink" />
        </SpecimenRow>
        <SpecimenRow label="size-6">
          <Spinner className="size-6 text-ink" />
        </SpecimenRow>
        <SpecimenRow label="size-8">
          <Spinner className="size-8 text-ink" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "className",
            type: "string",
            note: "Merged after `size-4 animate-spin` — the way to resize or recolour it.",
          },
          {
            name: "...props",
            type: 'React.ComponentProps<"svg">',
            note: 'Every SVG attribute. `role="status"` and `aria-label="Loading"` are set for you; override `aria-label` to translate it.',
          },
        ]}
      />

      <SpecimenTokens classes={["currentColor", "animate-spin"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["Spinner"];

export const specimen: Specimen = {
  id: "core-spinner",
  title: "Spinner",
  group: "Data display",
  render: () => <SpinnerSpecimen />,
};
