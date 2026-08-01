import { SplitView } from "@houston-ai/layout";
import type { ReactNode } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { Viewport } from "./sample";

/** One half of the split, filled the way an agent workspace fills it. */
function Pane({ title, lines }: { title: string; lines: readonly string[] }) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-4">
      <p className="font-medium text-ink text-sm">{title}</p>
      {lines.map((line) => (
        <p key={line} className="truncate text-ink-muted text-xs">
          {line}
        </p>
      ))}
    </div>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return (
    <Viewport className="h-64 w-full max-w-2xl">
      <div className="min-w-0 flex-1">{children}</div>
    </Viewport>
  );
}

const conversation = [
  "You: file the receipts that landed this morning",
  "Inbox Zero: found 6 receipts, 4 already matched",
  "Inbox Zero: two need a category before I file them",
];

const files = [
  "receipts/2026-07-flight-lisbon.pdf",
  "receipts/2026-07-hotel-porto.pdf",
  "reports/july-summary.md",
];

function SplitViewSpecimen() {
  return (
    <SpecimenPage
      title="SplitView"
      intro="Two resizable halves of one agent workspace: the conversation beside whatever it is working on."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — a split is its two slots and the four numbers that bound them. Drag any divider below; the panels resize live and clamp at their minimums."
      >
        <SpecimenRow label="Default — 55 / 45">
          <Stage>
            <SplitView
              left={<Pane title="Chat" lines={conversation} />}
              right={<Pane title="Files" lines={files} />}
            />
          </Stage>
        </SpecimenRow>
        <SpecimenRow label="Detail-heavy — 35 / 65">
          <Stage>
            <SplitView
              defaultLeftSize={35}
              defaultRightSize={65}
              left={<Pane title="Chat" lines={conversation} />}
              right={<Pane title="Files" lines={files} />}
            />
          </Stage>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The divider is a 1px hairline with a 4px hit area either side, and it takes focus: tab to it and the arrow keys resize. There is no collapsed state — a panel that should disappear is a caller's conditional, not a prop."
      >
        <SpecimenRow label="Tight minimums — 15 / 15, drag near an edge">
          <Stage>
            <SplitView
              minLeftSize={15}
              minRightSize={15}
              left={<Pane title="Chat" lines={conversation} />}
              right={<Pane title="Files" lines={files} />}
            />
          </Stage>
        </SpecimenRow>
        <SpecimenRow label="Generous minimums — 40 / 40, barely moves">
          <Stage>
            <SplitView
              minLeftSize={40}
              minRightSize={40}
              left={<Pane title="Chat" lines={conversation} />}
              right={<Pane title="Files" lines={files} />}
            />
          </Stage>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Every number is a percentage of the parent's width, never a pixel count, and the group is always `h-full` — the height belongs to whatever contains the split."
      >
        <SpecimenRow label="Short frame / tall frame, same percentages">
          <Viewport className="h-32 w-full max-w-md">
            <div className="min-w-0 flex-1">
              <SplitView
                left={<Pane title="Chat" lines={conversation.slice(0, 1)} />}
                right={<Pane title="Files" lines={files.slice(0, 1)} />}
              />
            </div>
          </Viewport>
          <Viewport className="h-64 w-full max-w-md">
            <div className="min-w-0 flex-1">
              <SplitView
                left={<Pane title="Chat" lines={conversation} />}
                right={<Pane title="Files" lines={files} />}
              />
            </div>
          </Viewport>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "left",
            type: "ReactNode",
            note: "Required. Clips overflow.",
          },
          {
            name: "right",
            type: "ReactNode",
            note: "Required. Clips overflow.",
          },
          {
            name: "defaultLeftSize",
            type: "number",
            note: "Percent of the width at first paint. Defaults to 55.",
          },
          {
            name: "defaultRightSize",
            type: "number",
            note: "Defaults to 45.",
          },
          {
            name: "minLeftSize",
            type: "number",
            note: "Percent the left panel will not shrink past. Defaults to 30.",
          },
          {
            name: "minRightSize",
            type: "number",
            note: "Defaults to 25.",
          },
        ]}
      />

      <SpecimenTokens classes={["bg-line", "ring-focus"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["SplitView"];

export const specimen: Specimen = {
  id: "agents-split-view",
  title: "SplitView",
  group: "Your Agents",
  render: () => <SplitViewSpecimen />,
};
