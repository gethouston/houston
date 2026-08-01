import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@houston-ai/core";
import { PauseIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { tooltipProps } from "./tooltip-parts";

/** One tip, parameterised by the placement prop the row is presenting. */
function Tip({
  trigger,
  label,
  side,
  align,
  sideOffset,
  delayDuration,
}: {
  trigger: ReactNode;
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  delayDuration?: number;
}) {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const props: SpecimenProp[] = tooltipProps;

function TooltipSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="Tooltip"
        intro="The name of an icon button. Never the only place a fact lives — hover may enhance an affordance, never gate one."
      >
        <SpecimenSection
          title="Variants"
          note="No style variants — one inverted chip with an arrow. `side` and `align` place it."
        >
          <SpecimenRow label="side: top / right / bottom / left">
            <Tip
              side="top"
              label="Run now"
              trigger={
                <Button variant="outline" size="icon">
                  <PlayIcon />
                </Button>
              }
            />
            <Tip
              side="right"
              label="Pause schedule"
              trigger={
                <Button variant="outline" size="icon">
                  <PauseIcon />
                </Button>
              }
            />
            <Tip
              side="bottom"
              label="Retry last run"
              trigger={
                <Button variant="outline" size="icon">
                  <RefreshCwIcon />
                </Button>
              }
            />
            <Tip
              side="left"
              label="Run now"
              trigger={
                <Button variant="outline" size="icon">
                  <PlayIcon />
                </Button>
              }
            />
          </SpecimenRow>
          <SpecimenRow label="align: start / center / end">
            <Tip
              align="start"
              label="Inbox Zero runs at 08:00"
              trigger={<Button variant="ghost">start</Button>}
            />
            <Tip
              align="center"
              label="Inbox Zero runs at 08:00"
              trigger={<Button variant="ghost">center</Button>}
            />
            <Tip
              align="end"
              label="Inbox Zero runs at 08:00"
              trigger={<Button variant="ghost">end</Button>}
            />
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="Hover or focus a trigger to open. A disabled button emits no pointer events, so its tip has to hang off a wrapper."
        >
          <SpecimenRow label="Default (instant)">
            <Tip
              label="Run Inbox Zero now"
              trigger={<Button>Run now</Button>}
            />
          </SpecimenRow>
          <SpecimenRow label="delayDuration={600}">
            <Tip
              delayDuration={600}
              label="Waits 600ms before opening"
              trigger={<Button variant="outline">Delayed</Button>}
            />
          </SpecimenRow>
          <SpecimenRow label="Disabled trigger (wrapped)">
            <Tip
              label="Connect Gmail before running this"
              trigger={
                <span className="inline-flex">
                  <Button disabled>Run now</Button>
                </span>
              }
            />
          </SpecimenRow>
          <SpecimenRow label="sideOffset={8}">
            <Tip
              sideOffset={8}
              label="Pushed 8px off the trigger"
              trigger={<Button variant="outline">Wider gap</Button>}
            />
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={props} />
        <SpecimenTokens classes={["bg-ink", "text-input", "fill-ink"]} />
      </SpecimenPage>
    </TooltipProvider>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Tooltip",
  "TooltipContent",
  "TooltipProvider",
  "TooltipTrigger",
];

export const specimen: Specimen = {
  id: "core-tooltip",
  title: "Tooltip",
  group: "Overlays",
  render: () => <TooltipSpecimen />,
};
