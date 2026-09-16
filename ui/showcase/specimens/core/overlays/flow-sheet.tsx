import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { CopyAgentFlow, PlainFlow } from "./flow-sheet-demos";
import { flowSheetProps } from "./flow-sheet-parts";

function FlowSheetSpecimen() {
  return (
    <SpecimenPage
      title="FlowSheet"
      intro="The one multi-step surface, in two sizes the STEP picks: the confirm dialog's 448px frame for a question with a short answer, the tall 672px one for a catalog to scan."
    >
      <SpecimenSection
        title="The frame"
        note="Open it and walk the steps: the choice is a hand-sized dialog that states its own question, the catalog is the tall surface, and the size switches without anything animating its box — only the step inside crossfades."
      >
        <SpecimenRow label="Compact → wide → compact">
          <CopyAgentFlow label="New agent" />
        </SpecimenRow>
        <SpecimenRow label="Wide, no progress — showTitle takes the slot">
          <PlainFlow label="Connect Gmail" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Anatomy"
        note="Compact: p-6, the question as the dialog title top-left, the way back inline before it, the dialog's own X top-right, progress under the title, actions inline at the foot. Wide: a h-12 header (back · progress · aside + close), a scrolling body at px-5 md:px-8, and a bar pinned under it past the home indicator."
      >
        <SpecimenRow label="Solid in both themes">
          <span className="text-ink-muted text-[13px]">
            `bg-dialog`, never glass: a flow sits over arbitrary content and
            must not bleed it. The entrance collapses under reduced motion.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={flowSheetProps} />
      <SpecimenTokens
        classes={["bg-dialog", "bg-black/25", "border-line", "text-ink-muted"]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["FlowSheet"];

export const specimen: Specimen = {
  id: "core-flow-sheet",
  title: "FlowSheet",
  group: "Overlays",
  render: () => <FlowSheetSpecimen />,
};
