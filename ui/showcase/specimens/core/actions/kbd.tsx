import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Kbd,
  KbdGroup,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@houston-ai/core";
import { ArrowBigUp, Command, CornerDownLeft, Option } from "lucide-react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

const props: readonly SpecimenProp[] = [
  {
    name: "Kbd",
    type: 'React.ComponentProps<"kbd">',
    note: "One key. `pointer-events-none` and unselectable, because it is a label, never a button.",
  },
  {
    name: "KbdGroup",
    type: 'React.ComponentProps<"div">',
    note: "A chord: several keys, 4px apart, on one baseline.",
  },
  {
    name: "className",
    type: "string",
    note: "The only knob. There is no variant and no size prop.",
  },
];

const tokens = [
  "bg-chip-subtle",
  "text-ink-muted",
  "in-data-[slot=tooltip-content]:bg-input/20",
  "in-data-[slot=tooltip-content]:text-input",
  "dark:in-data-[slot=tooltip-content]:bg-input/10",
];

function KbdSpecimen() {
  return (
    <SpecimenPage
      title="Kbd"
      intro="The key cap: 20px tall, system font, recessed chip fill. It states a shortcut; it never takes the click."
    >
      <SpecimenSection
        title="Variants"
        note="No variant prop. The one thing that changes it is where it sits: inside a tooltip it inverts, because a chip fill would vanish on the ink surface."
      >
        <SpecimenRow label="Single key">
          <Kbd>K</Kbd>
          <Kbd>Esc</Kbd>
          <Kbd>Enter</Kbd>
        </SpecimenRow>
        <SpecimenRow label="Chord (KbdGroup)">
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>P</Kbd>
          </KbdGroup>
        </SpecimenRow>
        <SpecimenRow label="With an icon">
          <KbdGroup>
            <Kbd>
              <Command />
            </Kbd>
            <Kbd>
              <CornerDownLeft />
            </Kbd>
          </KbdGroup>
          <KbdGroup>
            <Kbd>
              <Option />
            </Kbd>
            <Kbd>
              <ArrowBigUp />
            </Kbd>
            <Kbd>N</Kbd>
          </KbdGroup>
        </SpecimenRow>
        <SpecimenRow label="Inside a tooltip">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="flex items-center gap-2">
                  Publish Inbox Zero
                  <KbdGroup>
                    <Kbd>⌘</Kbd>
                    <Kbd>P</Kbd>
                  </KbdGroup>
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="It has none of its own: no hover, no focus, no disabled. It inherits the opacity of whatever it sits in, which is how a shortcut fades with its disabled row."
      >
        <SpecimenRow label="In a button">
          <Button variant="outline">
            Open the palette
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
          <Button variant="outline" disabled>
            Open the palette
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
        </SpecimenRow>
        <SpecimenRow label="In a field">
          <div className="w-72 max-w-full">
            <InputGroup>
              <InputGroupInput
                placeholder="Search agents"
                aria-label="Search agents"
              />
              <InputGroupAddon align="inline-end">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </SpecimenRow>
        <SpecimenRow label="Beside body copy">
          <span className="text-ink text-sm">
            Press <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to send the run without leaving
            the composer.
          </span>
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
export const sources: string[] = ["Kbd", "KbdGroup"];

export const specimen: Specimen = {
  id: "core-kbd",
  title: "Kbd",
  group: "Actions & inputs",
  render: () => <KbdSpecimen />,
};
