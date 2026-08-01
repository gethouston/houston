import {
  Button,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
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
import { hoverCardProps } from "./hover-card-parts";

/** The creator card, reused per row so only the placement/timing prop changes. */
function CreatorCard({
  trigger,
  align,
  side,
  openDelay,
  closeDelay,
}: {
  trigger: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  openDelay?: number;
  closeDelay?: number;
}) {
  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent align={align} side={side}>
        <p className="font-medium text-sm">@julian</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Publishes Inbox Zero, Meeting Notes and Weekly Report. 10k installs.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Controlled: the parent owns `open`, so hover is not the only way in. */
function ControlledHoverCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={() => setOpen((was) => !was)}>
        {open ? "Hide card" : "Show card"}
      </Button>
      <HoverCard open={open} onOpenChange={setOpen}>
        <HoverCardTrigger asChild>
          <span className="text-[13px] text-ink-muted underline underline-offset-4">
            @julian
          </span>
        </HoverCardTrigger>
        <HoverCardContent>
          <p className="font-medium text-sm">@julian</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Joined March 2025 · 3 agents published.
          </p>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

const props: SpecimenProp[] = hoverCardProps;

function HoverCardSpecimen() {
  return (
    <SpecimenPage
      title="HoverCard"
      intro="Preview on hover, for pointer users. It is never the only path to the information — it enhances a link, it does not gate one."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants — placement is what varies. Hover any trigger below to open it."
      >
        <SpecimenRow label='align="start"'>
          <CreatorCard
            align="start"
            openDelay={120}
            trigger={<Button variant="link">@julian</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label='align="center" (default)'>
          <CreatorCard
            openDelay={120}
            trigger={<Button variant="link">@julian</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label='align="end"'>
          <CreatorCard
            align="end"
            openDelay={120}
            trigger={<Button variant="link">@julian</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="side: top / right / bottom / left">
          <CreatorCard
            side="top"
            openDelay={120}
            trigger={<Button variant="ghost">Top</Button>}
          />
          <CreatorCard
            side="right"
            openDelay={120}
            trigger={<Button variant="ghost">Right</Button>}
          />
          <CreatorCard
            side="bottom"
            openDelay={120}
            trigger={<Button variant="ghost">Bottom</Button>}
          />
          <CreatorCard
            side="left"
            openDelay={120}
            trigger={<Button variant="ghost">Left</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Closed until hovered or focused. Keyboard focus opens it too, so it is not pointer-only."
      >
        <SpecimenRow label="Default timing (700ms)">
          <CreatorCard trigger={<Button variant="outline">@julian</Button>} />
        </SpecimenRow>
        <SpecimenRow label="openDelay={0}">
          <CreatorCard
            openDelay={0}
            trigger={<Button variant="outline">@julian</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="closeDelay={1000}">
          <CreatorCard
            openDelay={120}
            closeDelay={1000}
            trigger={<Button variant="outline">@julian</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="Controlled">
          <ControlledHoverCard />
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
  "HoverCard",
  "HoverCardContent",
  "HoverCardTrigger",
];

export const specimen: Specimen = {
  id: "core-hover-card",
  title: "HoverCard",
  group: "Overlays",
  render: () => <HoverCardSpecimen />,
};
