import { KanbanCard } from "@houston-ai/board";
import { Badge, TooltipProvider } from "@houston-ai/core";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  CARD_PROPS,
  CardSlot,
  EditableCard,
  SelectableCards,
} from "./kanban-card-parts";
import {
  AGENT_ICON,
  DONE_MISSION,
  ERROR_MISSION,
  NEEDS_YOU_MISSION,
  RUNNING_MISSION,
} from "./sample";

/** Status → the card's treatment, in the order the board's sections run. */
const BY_STATUS = [
  { label: "running", item: RUNNING_MISSION },
  { label: "needs_you", item: NEEDS_YOU_MISSION },
  { label: "done", item: DONE_MISSION },
  { label: "error", item: ERROR_MISSION },
] as const;

function KanbanCardSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="KanbanCard"
        intro="One mission on the Activity board: the agent it belongs to, what it is doing, who is on it, and the actions it accepts."
      >
        <SpecimenSection
          title="Variants"
          note="Status is the variant axis, and it is data, not an enum: `runningStatuses`, `approveStatuses` and `errorStatuses` name which of the item's own status strings get the glow, the approve action and the danger border. Everything else is the resting card."
        >
          {BY_STATUS.map((one) => (
            <SpecimenRow key={one.label} label={one.label}>
              <CardSlot>
                <KanbanCard
                  item={one.item}
                  avatar={AGENT_ICON}
                  onSelect={() => {}}
                  onApprove={() => {}}
                />
              </CardSlot>
            </SpecimenRow>
          ))}
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="`selected` is the card open in the detail panel; `highlighted` is the one arrow-key navigation has moved to but not opened. Both are live below — nothing is faked."
        >
          <SpecimenRow label="Selected / highlighted">
            <CardSlot>
              <KanbanCard
                item={DONE_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                selected
              />
            </CardSlot>
            <CardSlot>
              <KanbanCard
                item={DONE_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                highlighted
              />
            </CardSlot>
          </SpecimenRow>
          <SpecimenRow label="Unread">
            <CardSlot>
              <KanbanCard
                item={NEEDS_YOU_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
              />
            </CardSlot>
            <CardSlot>
              <KanbanCard
                item={NEEDS_YOU_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                selected
              />
            </CardSlot>
          </SpecimenRow>
          <SpecimenRow label="Multi-select">
            <SelectableCards />
          </SpecimenRow>
          <SpecimenRow label="Rename and delete">
            <EditableCard />
          </SpecimenRow>
          <SpecimenRow label="Dragging">
            <CardSlot>
              <KanbanCard
                item={RUNNING_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                enableDrag
                dragging
              />
            </CardSlot>
          </SpecimenRow>
          <SpecimenRow label="Tags and custom actions">
            <CardSlot>
              <KanbanCard
                item={DONE_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
                actions={<Badge variant="secondary">3 replies</Badge>}
              />
            </CardSlot>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="One size. The card takes the width of the column it is dropped into; only the people stack changes the body, reserving a right gutter so the description never runs under the faces."
        >
          <SpecimenRow label="Two people / six people">
            <CardSlot>
              <KanbanCard
                item={RUNNING_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
              />
            </CardSlot>
            <CardSlot>
              <KanbanCard
                item={DONE_MISSION}
                avatar={AGENT_ICON}
                onSelect={() => {}}
              />
            </CardSlot>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={CARD_PROPS} />

        <SpecimenTokens
          classes={[
            "bg-input",
            "bg-hover",
            "bg-chip",
            "border-line/20",
            "border-danger/60",
            "ring-action/50",
            "ring-offset-input",
            "text-ink",
            "text-ink-muted",
            "bg-action",
            "text-action-text",
            "text-success",
            "text-danger",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = ["KanbanCard"];

export const specimen: Specimen = {
  id: "board-kanban-card",
  title: "KanbanCard",
  group: "Activity",
  render: () => <KanbanCardSpecimen />,
};
