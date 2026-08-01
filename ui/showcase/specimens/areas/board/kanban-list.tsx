import { KanbanListRail } from "@houston-ai/board";
import { TooltipProvider } from "@houston-ai/core";
import { storeType } from "@houston-ai/store";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { LIST_PROPS, LiveArchivedList, Rows } from "./kanban-list-parts";

function KanbanListSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="KanbanList"
        intro="The column-less view of the same missions — the Archived tab: short rows on a rail, newest first, each one a mission you can reopen or delete."
      >
        <SpecimenSection
          title="Variants"
          note="`align` is the only variant, and it is about the pane, not the row: `center` keeps a fixed reading column (max-w-2xl) in the middle, `left` fills the pane so the rows shrink with it when the chat panel opens beside them."
        >
          <SpecimenRow label='align="center"'>
            <LiveArchivedList />
          </SpecimenRow>
          <SpecimenRow label='align="left"'>
            <LiveArchivedList align="left" />
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="A row is one line until a search snippet makes it two. The title is never highlighted — a match in the title is already visible; the snippet exists for the match that is not, and it shows the matched span in the body so the user sees why the mission surfaced."
        >
          <SpecimenRow label="Row: plain / with a snippet / selected">
            <Rows />
          </SpecimenRow>
          <SpecimenRow label="Empty">
            <span className={storeType.meta}>
              Delete every row above to see the `emptyState` node take the whole
              list.
            </span>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="`KanbanListRail` is the sizing itself, exported so a consumer's own header can line up with the rows under it — the Archived tab's search field uses it for exactly that."
        >
          <SpecimenRow label="The rail, centred">
            <div className="w-full rounded-xl bg-background py-3">
              <KanbanListRail className="rounded-lg border border-line border-dashed p-3">
                <span className={storeType.meta}>
                  mx-auto w-full max-w-2xl — the reading column
                </span>
              </KanbanListRail>
            </div>
          </SpecimenRow>
          <SpecimenRow label="The rail, left">
            <div className="w-full rounded-xl bg-background py-3">
              <KanbanListRail
                align="left"
                className="rounded-lg border border-line border-dashed p-3"
              >
                <span className={storeType.meta}>
                  w-full — the pane's padding is the only inset
                </span>
              </KanbanListRail>
            </div>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={LIST_PROPS} />

        <SpecimenTokens
          classes={[
            "bg-card",
            "bg-hover",
            "border-line",
            "text-ink",
            "text-ink-muted",
            "text-danger",
            "bg-highlight",
            "text-highlight-text",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = [
  "KanbanList",
  "KanbanListItem",
  "KanbanListRail",
];

export const specimen: Specimen = {
  id: "board-kanban-list",
  title: "KanbanList",
  group: "Activity",
  render: () => <KanbanListSpecimen />,
};
