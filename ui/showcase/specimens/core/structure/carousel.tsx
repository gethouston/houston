import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@houston-ai/core";
import type * as React from "react";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

const agents = [
  { name: "Inbox Zero", meta: "Gmail · 4.2k installs" },
  { name: "Meeting Notes", meta: "Calendar · 3.1k installs" },
  { name: "Weekly Report", meta: "Sheets · 2.7k installs" },
  { name: "Expense Filer", meta: "Drive · 1.9k installs" },
  { name: "Contract Reader", meta: "Drive · 1.4k installs" },
];

/** One slide: a store card, so the slide is a real thing and not a grey box. */
function Slide({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="flex h-28 flex-col justify-center gap-1 rounded-2xl border border-line bg-card p-6">
      <p className="font-medium text-sm">{name}</p>
      <p className="text-ink-muted text-xs">{meta}</p>
    </div>
  );
}

/**
 * The arrows are absolutely positioned OUTSIDE the carousel root (`-left-12` /
 * `-right-12` horizontally, `-top-12` / `-bottom-12` vertically), so the gutter
 * they need belongs to a wrapper around the root — never to the root itself.
 */
function Rail({
  orientation = "horizontal",
  opts,
  slides = agents,
  itemClassName,
}: {
  orientation?: "horizontal" | "vertical";
  opts?: React.ComponentProps<typeof Carousel>["opts"];
  slides?: typeof agents;
  itemClassName?: string;
}) {
  const vertical = orientation === "vertical";

  return (
    <div
      className={vertical ? "w-full max-w-sm py-12" : "w-full max-w-sm px-12"}
    >
      <Carousel orientation={orientation} opts={opts}>
        <CarouselContent className={vertical ? "h-28" : undefined}>
          {slides.map((agent) => (
            <CarouselItem key={agent.name} className={itemClassName}>
              <Slide {...agent} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}

const props: SpecimenProp[] = [
  {
    name: "orientation",
    type: '"horizontal" | "vertical"',
    note: 'Defaults to "horizontal". Sets Embla\'s axis and flips the arrows.',
  },
  {
    name: "opts",
    type: "CarouselOptions",
    note: "Embla options — loop, align, slidesToScroll, dragFree.",
  },
  {
    name: "plugins",
    type: "CarouselPlugin",
    note: "Embla plugins (autoplay, wheel gestures).",
  },
  {
    name: "setApi",
    type: "(api: CarouselApi) => void",
    note: "Hands out the Embla API for external controls or a slide counter.",
  },
  {
    name: "CarouselItem.className",
    type: "string",
    note: "Basis is full by default; set basis-1/2 etc. to show several slides.",
  },
  {
    name: "CarouselPrevious / CarouselNext",
    type: "React.ComponentProps<typeof Button>",
    note: 'Buttons — variant "outline", size "icon" by default; disabled at the ends.',
  },
];

/**
 * The carousel paints nothing itself — its own classes are layout only. The
 * colour on the page comes from the two arrows, which are `Button`s in the
 * `outline` variant.
 */
const tokens = [
  "bg-input",
  "border-line-input",
  "bg-line-input/30",
  "bg-hover",
  "text-hover-text",
  "border-focus",
  "ring-focus/50",
];

function CarouselSpecimen() {
  return (
    <SpecimenPage
      title="Carousel"
      intro="A swipeable rail of cards — the store's featured row. Drag it, or use the arrows and ←/→."
    >
      <SpecimenSection
        title="Variants"
        note="Both axes, plus the multi-slide rail you get by changing an item's basis."
      >
        <SpecimenRow label='orientation="horizontal"'>
          <Rail />
        </SpecimenRow>
        <SpecimenRow label='orientation="vertical"'>
          <Rail orientation="vertical" />
        </SpecimenRow>
        <SpecimenRow label="Two slides per view">
          <Rail itemClassName="basis-1/2" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Each arrow disables itself at its end of the rail; with opts.loop neither ever does."
      >
        <SpecimenRow label="At the start — previous disabled">
          <Rail />
        </SpecimenRow>
        <SpecimenRow label="opts={{ loop: true }} — never disabled">
          <Rail opts={{ loop: true }} />
        </SpecimenRow>
        <SpecimenRow label="One slide — both disabled">
          <Rail slides={agents.slice(0, 1)} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens classes={tokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Carousel",
  "CarouselContent",
  "CarouselItem",
  "CarouselNext",
  "CarouselPrevious",
];

export const specimen: Specimen = {
  id: "core-carousel",
  title: "Carousel",
  group: "Structure & nav",
  render: () => <CarouselSpecimen />,
};
