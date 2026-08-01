import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@houston-ai/core";
import { type ReactNode, useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** The schedule popover, reused per row so only the placement prop changes. */
function SchedulePopover({
  trigger,
  align,
  side,
  sideOffset,
}: {
  trigger: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} side={side} sideOffset={sideOffset}>
        <PopoverHeader>
          <PopoverTitle>Runs every weekday</PopoverTitle>
          <PopoverDescription>
            Inbox Zero starts at 08:00 in your timezone and stops when the inbox
            is clear.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

/** Controlled: the parent owns `open`, so anything can drive it. */
function ControlledPopover() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary">{open ? "Hide details" : "Details"}</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Meeting Notes</PopoverTitle>
          <PopoverDescription>
            Published by @julian · 3.1k installs
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

const props: SpecimenProp[] = [
  { name: "Popover.open", type: "boolean", note: "Controlled open state." },
  {
    name: "Popover.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on trigger, Escape and outside click.",
  },
  {
    name: "Popover.modal",
    type: "boolean",
    note: "Default false. True traps focus and blocks the page behind it.",
  },
  {
    name: "PopoverContent.align",
    type: '"start" | "center" | "end"',
    note: 'Default "center". Alignment against the trigger.',
  },
  {
    name: "PopoverContent.side",
    type: '"top" | "right" | "bottom" | "left"',
    note: 'Default "bottom". Flips automatically when it would overflow.',
  },
  {
    name: "PopoverContent.sideOffset",
    type: "number",
    note: "Default 4. Gap in px between trigger and content.",
  },
  {
    name: "PopoverAnchor",
    type: "React.ComponentProps<typeof Popover.Anchor>",
    note: "Positions the content against something other than the trigger.",
  },
];

function PopoverSpecimen() {
  return (
    <SpecimenPage
      title="Popover"
      intro="The click-to-open panel anchored to its trigger. Fixed 288px wide; it holds a little content, not a form."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants — placement is what varies. `align` runs along the trigger's edge, `side` picks the edge."
      >
        <SpecimenRow label='align="start"'>
          <SchedulePopover
            align="start"
            trigger={<Button variant="outline">Schedule</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label='align="center" (default)'>
          <SchedulePopover
            trigger={<Button variant="outline">Schedule</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label='align="end"'>
          <SchedulePopover
            align="end"
            trigger={<Button variant="outline">Schedule</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="side: top / right / bottom / left">
          <SchedulePopover
            side="top"
            trigger={<Button variant="ghost">Top</Button>}
          />
          <SchedulePopover
            side="right"
            trigger={<Button variant="ghost">Right</Button>}
          />
          <SchedulePopover
            side="bottom"
            trigger={<Button variant="ghost">Bottom</Button>}
          />
          <SchedulePopover
            side="left"
            trigger={<Button variant="ghost">Left</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Closed, open, and who owns that. A disabled trigger never opens."
      >
        <SpecimenRow label="Closed">
          <SchedulePopover trigger={<Button>Schedule</Button>} />
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <SchedulePopover trigger={<Button disabled>Schedule</Button>} />
        </SpecimenRow>
        <SpecimenRow label="Controlled">
          <ControlledPopover />
        </SpecimenRow>
        <SpecimenRow label="sideOffset={12}">
          <SchedulePopover
            sideOffset={12}
            trigger={<Button variant="outline">Wider gap</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-popover",
          "text-popover-text",
          "border",
          "text-ink-muted",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Popover",
  "PopoverContent",
  "PopoverDescription",
  "PopoverHeader",
  "PopoverTitle",
  "PopoverTrigger",
];

export const specimen: Specimen = {
  id: "core-popover",
  title: "Popover",
  group: "Overlays",
  render: () => <PopoverSpecimen />,
};
