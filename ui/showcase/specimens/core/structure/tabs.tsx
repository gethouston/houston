import { Tabs, TabsContent, TabsList, TabsTrigger } from "@houston-ai/core";
import { Activity, Settings2, Sparkles } from "lucide-react";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** One tab set, so every row below reads the same content in a new shape. */
function AgentTabs({
  variant,
  orientation = "horizontal",
}: {
  variant?: "default" | "line";
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <Tabs defaultValue="overview" orientation={orientation} className="w-fit">
      <TabsList variant={variant}>
        <TabsTrigger value="overview">
          <Sparkles /> Overview
        </TabsTrigger>
        <TabsTrigger value="runs">
          <Activity /> Runs
        </TabsTrigger>
        <TabsTrigger value="settings">
          <Settings2 /> Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-3 text-ink-muted text-sm">
        Inbox Zero triages your mail every morning.
      </TabsContent>
      <TabsContent value="runs" className="pt-3 text-ink-muted text-sm">
        142 runs in the last 30 days.
      </TabsContent>
      <TabsContent value="settings" className="pt-3 text-ink-muted text-sm">
        Runs on a schedule, weekdays at 08:00.
      </TabsContent>
    </Tabs>
  );
}

const props: SpecimenProp[] = [
  {
    name: "Tabs.orientation",
    type: '"horizontal" | "vertical"',
    note: 'Defaults to "horizontal". Drives the list axis and the active marker.',
  },
  {
    name: "Tabs.value / defaultValue",
    type: "string",
    note: "Radix Tabs.Root — controlled or uncontrolled active tab.",
  },
  {
    name: "Tabs.onValueChange",
    type: "(value: string) => void",
    note: "Fires on tab change.",
  },
  {
    name: "TabsList.variant",
    type: '"default" | "line"',
    note: 'Defaults to "default" (filled track). "line" is a bare underline set.',
  },
  {
    name: "TabsTrigger.value",
    type: "string",
    note: "Pairs the trigger with its TabsContent.",
  },
  {
    name: "TabsTrigger.disabled",
    type: "boolean",
    note: "Non-selectable; drops to 50% opacity.",
  },
  {
    name: "TabsContent.value",
    type: "string",
    note: "The panel shown while its trigger is active.",
  },
];

const tokens = [
  "bg-chip-subtle",
  "text-ink",
  "text-ink/60",
  "text-ink-muted",
  "bg-input",
  "border-line-input",
  "bg-line-input/30",
  "bg-action",
  "border-focus",
  "ring-focus/50",
  "outline-focus",
];

function TabsSpecimen() {
  return (
    <SpecimenPage
      title="Tabs"
      intro="Switches between sibling panels of one thing — an agent's overview, its runs, its settings."
    >
      <SpecimenSection
        title="Variants"
        note="Both list variants, plus the vertical axis the root supports."
      >
        <SpecimenRow label='variant="default"'>
          <AgentTabs variant="default" />
        </SpecimenRow>
        <SpecimenRow label='variant="line"'>
          <AgentTabs variant="line" />
        </SpecimenRow>
        <SpecimenRow label='orientation="vertical"'>
          <AgentTabs orientation="vertical" />
        </SpecimenRow>
        <SpecimenRow label='vertical · variant="line"'>
          <AgentTabs orientation="vertical" variant="line" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Selection is the only state a tab set carries; hover lifts an inactive trigger to full ink."
      >
        <SpecimenRow label="Active / inactive">
          <AgentTabs />
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <Tabs defaultValue="overview" className="w-fit">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="runs" disabled>
                Runs
              </TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
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
  "Tabs",
  "TabsContent",
  "TabsList",
  "TabsTrigger",
];

export const specimen: Specimen = {
  id: "core-tabs",
  title: "Tabs",
  group: "Structure & nav",
  render: () => <TabsSpecimen />,
};
