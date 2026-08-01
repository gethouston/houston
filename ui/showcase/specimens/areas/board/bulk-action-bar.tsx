import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { LiveBulkActionBar, MOVE_TARGETS } from "./bulk-action-bar-parts";

function BulkActionBarSpecimen() {
  return (
    <SpecimenPage
      title="BulkActionBar"
      intro="The floating bar that appears while missions are multi-selected: move them to another section, archive them, delete them, or drop the selection."
    >
      <SpecimenSection
        title="Variants"
        note="`moveTargets` is the only shape axis. Two or more sections give a dropdown; a selection locked to one section gets that section as a plain button instead of a one-item menu; none at all drops the control entirely."
      >
        <SpecimenRow label="Two move targets">
          <LiveBulkActionBar />
        </SpecimenRow>
        <SpecimenRow label="One move target">
          <LiveBulkActionBar moveTargets={[MOVE_TARGETS[1]]} />
        </SpecimenRow>
        <SpecimenRow label="No move targets">
          <LiveBulkActionBar moveTargets={[]} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Every action confirms before it runs — move and archive on the default dialog, delete on the destructive one — because a bulk mistake rewrites many missions at once. Try them above: the line behind the bar only changes once a dialog is accepted."
      >
        <SpecimenRow label="A whole column selected">
          <LiveBulkActionBar initialCount={128} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size, and it is not laid out: the bar is absolutely positioned 24px above the bottom of its nearest positioned ancestor and centred, so the board scrolls underneath it and a narrow pane never reflows it."
      >
        <SpecimenRow label="In a narrow pane">
          <div className="w-full max-w-md">
            <LiveBulkActionBar />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "count",
            type: "number",
            note: "How many missions are selected. The bar renders for any count.",
          },
          {
            name: "moveTargets",
            type: "BulkMoveTarget[]",
            note: "`{ status, label }` per section the selection may move to.",
          },
          {
            name: "onMove",
            type: "(status: string) => void",
            note: "Called with the chosen target's status, after confirmation.",
          },
          {
            name: "onArchive / onDelete",
            type: "() => void",
            note: "Called after their own confirmation dialogs.",
          },
          {
            name: "onClear",
            type: "() => void",
            note: "Drops the selection. The one action with no confirm.",
          },
          {
            name: "labels",
            type: "BulkActionBarLabels",
            note: "Required in full — every string, already translated. No English defaults.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-popover",
          "border-line/60",
          "bg-line",
          "text-ink",
          "text-ink-muted",
          "bg-hover",
          "text-danger",
        ]}
      />
    </SpecimenPage>
  );
}

export const sources: string[] = ["BulkActionBar"];

export const specimen: Specimen = {
  id: "board-bulk-action-bar",
  title: "BulkActionBar",
  group: "Activity",
  render: () => <BulkActionBarSpecimen />,
};
