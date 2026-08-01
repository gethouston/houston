import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@houston-ai/core";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** A panel's filling: a label plus one line of realistic content. */
function Pane({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 p-4">
      <p className="font-medium text-sm">{title}</p>
      <p className="text-ink-muted text-xs">{body}</p>
    </div>
  );
}

const frame = "h-44 w-full max-w-lg rounded-xl border border-line bg-card";

const props: SpecimenProp[] = [
  {
    name: "ResizablePanelGroup.orientation",
    type: '"horizontal" | "vertical"',
    note: 'Defaults to "horizontal". Vertical stacks the panels and lays the divider flat.',
  },
  {
    name: "ResizablePanelGroup.disabled",
    type: "boolean",
    note: "Turns off resizing for every panel and divider in the group.",
  },
  {
    name: "ResizablePanelGroup.onLayoutChanged",
    type: "(layout: Layout, meta: LayoutChangedMeta) => void",
    note: "Fires once the drag ends — the callback to persist a layout with.",
  },
  {
    name: "ResizablePanel.defaultSize / minSize / maxSize",
    type: "number | string",
    note: 'Numbers are pixels; strings are percentages ("40%").',
  },
  {
    name: "ResizablePanel.collapsible / collapsedSize",
    type: "boolean | number | string",
    note: "Lets a panel snap shut once dragged under its minimum.",
  },
  {
    name: "ResizablePanel.disabled",
    type: "boolean",
    note: "This panel cannot be resized, directly or indirectly.",
  },
  {
    name: "ResizableHandle.withHandle",
    type: "boolean",
    note: "Adds the centred grip. Off by default — the divider is a bare hairline.",
  },
  {
    name: "ResizableHandle.disabled",
    type: "boolean",
    note: "The divider stays visible but stops dragging its neighbours.",
  },
];

const tokens = ["bg-line", "ring-focus"];

function ResizableSpecimen() {
  return (
    <SpecimenPage
      title="Resizable"
      intro="A draggable split — the shape behind a list-and-detail pane or a chat-beside-preview layout. Every divider below is live."
    >
      <SpecimenSection
        title="Variants"
        note="Two group orientations, and the divider with or without its grip."
      >
        <SpecimenRow label='orientation="horizontal"'>
          <ResizablePanelGroup orientation="horizontal" className={frame}>
            <ResizablePanel defaultSize="40%" minSize="20%">
              <Pane title="Agents" body="Inbox Zero · Meeting Notes" />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="60%" minSize="20%">
              <Pane title="Inbox Zero" body="Last run 6 minutes ago." />
            </ResizablePanel>
          </ResizablePanelGroup>
        </SpecimenRow>
        <SpecimenRow label='orientation="vertical"'>
          <ResizablePanelGroup orientation="vertical" className={frame}>
            <ResizablePanel defaultSize="55%" minSize="20%">
              <Pane title="Conversation" body="12 turns with @julian." />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="45%" minSize="20%">
              <Pane
                title="Run log"
                body="41 threads read, 6 replies drafted."
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </SpecimenRow>
        <SpecimenRow label="withHandle">
          <ResizablePanelGroup orientation="horizontal" className={frame}>
            <ResizablePanel defaultSize="50%" minSize="20%">
              <Pane title="Agents" body="Weekly Report · Expense Filer" />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="50%" minSize="20%">
              <Pane title="Weekly Report" body="Next run Friday at 17:00." />
            </ResizablePanel>
          </ResizablePanelGroup>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The divider takes a focus ring on keyboard focus and moves with the arrow keys."
      >
        <SpecimenRow label="Collapsible panel">
          <ResizablePanelGroup orientation="horizontal" className={frame}>
            <ResizablePanel defaultSize="35%" minSize="20%" collapsible>
              <Pane title="Agents" body="Drag left to collapse this pane." />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="65%">
              <Pane
                title="Meeting Notes"
                body="Files follow-ups after calls."
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </SpecimenRow>
        <SpecimenRow label="Disabled group">
          <ResizablePanelGroup
            orientation="horizontal"
            disabled
            className={frame}
          >
            <ResizablePanel defaultSize="50%">
              <Pane title="Agents" body="The split is fixed here." />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="50%">
              <Pane title="Standup Buddy" body="Posts the standup at 09:15." />
            </ResizablePanel>
          </ResizablePanelGroup>
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
  "ResizableHandle",
  "ResizablePanel",
  "ResizablePanelGroup",
];

export const specimen: Specimen = {
  id: "core-resizable",
  title: "Resizable",
  group: "Structure & nav",
  render: () => <ResizableSpecimen />,
};
