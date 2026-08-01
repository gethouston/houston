import { KanbanColumn } from "@houston-ai/board";
import { Button, TooltipProvider } from "@houston-ai/core";
import { Archive } from "lucide-react";
import type { ReactNode } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { COLUMN_PROPS } from "./kanban-column-parts";
import { AGENT_ICON, DONE_MISSION, MISSIONS, RUNNING_MISSION } from "./sample";

const RUNNING = MISSIONS.filter((one) => one.status === "running");

/** A column stretches to the board's height, so it is reviewed at one. */
function ColumnSlot({ children }: { children: ReactNode }) {
  return <div className="flex h-80 w-64 flex-col">{children}</div>;
}

function KanbanColumnSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="KanbanColumn"
        intro="One section of the Activity board: a counted header, its cards, and the drop affordance it wears while a card is in flight."
      >
        <SpecimenSection
          title="Variants"
          note="The header is the whole chrome: the section name, the count once there is one, and an optional consumer-owned `headerAction` on the right. The add button is a trailing affordance under the cards, not a header control — and it is the one place this component still paints raw black/white literals instead of tokens, which is why it is absent from the list below."
        >
          <SpecimenRow label="With cards">
            <ColumnSlot>
              <KanbanColumn
                columnId="running"
                label="Running"
                items={RUNNING}
                avatar={AGENT_ICON}
                onSelect={() => {}}
              />
            </ColumnSlot>
          </SpecimenRow>
          <SpecimenRow label="Empty">
            <ColumnSlot>
              <KanbanColumn
                columnId="needs-you"
                label="Needs you"
                items={[]}
                onSelect={() => {}}
              />
            </ColumnSlot>
          </SpecimenRow>
          <SpecimenRow label="Add button">
            <ColumnSlot>
              <KanbanColumn
                columnId="running"
                label="Running"
                items={[RUNNING_MISSION]}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                onAdd={() => {}}
                addLabel="New mission"
              />
            </ColumnSlot>
          </SpecimenRow>
          <SpecimenRow label="Header action">
            <ColumnSlot>
              <KanbanColumn
                columnId="done"
                label="Done"
                items={[DONE_MISSION]}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                headerAction={
                  <Button variant="ghost" size="icon" aria-label="Archive all">
                    <Archive className="size-3.5" />
                  </Button>
                }
              />
            </ColumnSlot>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="Drag state is passed in, never sensed: the board resolves which columns accept the card in flight and hands each one `isDropTarget`, then `isOver` for the one under the pointer. See KanbanBoard for the live drag."
        >
          <SpecimenRow label="Drop target / over">
            <ColumnSlot>
              <KanbanColumn
                columnId="needs-you"
                label="Needs you"
                items={[]}
                onSelect={() => {}}
                isDropTarget
              />
            </ColumnSlot>
            <ColumnSlot>
              <KanbanColumn
                columnId="needs-you"
                label="Needs you"
                items={[]}
                onSelect={() => {}}
                isDropTarget
                isOver
              />
            </ColumnSlot>
          </SpecimenRow>
          <SpecimenRow label="Selectable cards">
            <ColumnSlot>
              <KanbanColumn
                columnId="running"
                label="Running"
                items={RUNNING}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                selectable
                selectedIds={new Set([RUNNING_MISSION.id])}
                onToggleSelect={() => {}}
              />
            </ColumnSlot>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="One size, and it is elastic: `min-w-[180px] flex-1` inside the board's row, full height with the card list scrolling. Three columns share a board evenly; a fourth simply narrows them until the minimum bites and the board scrolls."
        >
          <SpecimenRow label="Two columns sharing a row">
            <div className="flex h-80 w-full gap-3">
              <KanbanColumn
                columnId="running"
                label="Running"
                items={RUNNING}
                avatar={AGENT_ICON}
                onSelect={() => {}}
              />
              <KanbanColumn
                columnId="done"
                label="Done"
                items={[DONE_MISSION]}
                avatar={AGENT_ICON}
                onSelect={() => {}}
              />
            </div>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={COLUMN_PROPS} />

        <SpecimenTokens
          classes={[
            "bg-chip",
            "bg-hover",
            "text-ink",
            "text-ink-muted/60",
            "ring-action/40",
            "ring-action/15",
            "ring-focus",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = ["KanbanColumn"];

export const specimen: Specimen = {
  id: "board-kanban-column",
  title: "KanbanColumn",
  group: "Activity",
  render: () => <KanbanColumnSpecimen />,
};
