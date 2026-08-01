import { TooltipProvider } from "@houston-ai/core";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  BOARD_PROPS,
  DraggableBoard,
  DragRoles,
  EmptyBoard,
} from "./kanban-board-parts";

function KanbanBoardSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="KanbanBoard"
        intro="The Activity tab's mission board: sections built from statuses, cards bucketed into them, and a pointer drag that moves a mission between them."
      >
        <SpecimenSection
          title="Variants"
          note="The board has one shape and two contents. Columns are configuration, not markup: each column names the statuses it holds, and the board buckets `items` by them and sorts each bucket newest-first."
        >
          <SpecimenRow label="With missions">
            <DraggableBoard />
          </SpecimenRow>
          <SpecimenRow label="Empty">
            <EmptyBoard />
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="Drag is opt-in: passing `onItemMove` turns it on. The board runs it on pointer events rather than native HTML5 drag, so the cursor is identical on every OS, and it suspends itself while a multi-selection is active — the bulk action bar owns moves then."
        >
          <SpecimenRow label="Drop eligibility">
            <DragRoles />
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="One size: the board fills the pane it is given (`flex-1`, full height). Columns share the width evenly until they hit their 180px minimum, after which the board scrolls sideways rather than crushing them — what a narrow pane does when the chat panel opens beside it."
        >
          <SpecimenRow label="Narrow pane">
            <div className="w-full max-w-sm">
              <DraggableBoard />
            </div>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={BOARD_PROPS} />

        <SpecimenTokens
          classes={["bg-chip", "bg-hover", "ring-action/40", "ring-action/15"]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = [
  "KanbanBoard",
  "columnDragRole",
  "defaultCanDropItem",
];

export const specimen: Specimen = {
  id: "board-kanban-board",
  title: "KanbanBoard",
  group: "Activity",
  render: () => <KanbanBoardSpecimen />,
};
