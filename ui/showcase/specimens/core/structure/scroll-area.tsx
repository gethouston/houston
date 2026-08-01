import { ScrollArea, ScrollBar } from "@houston-ai/core";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

const agents = [
  "Inbox Zero",
  "Meeting Notes",
  "Weekly Report",
  "Expense Filer",
  "Contract Reader",
  "Standup Buddy",
  "Lead Triage",
  "Invoice Chaser",
  "Release Notes",
  "Support Digest",
];

const tags = [
  "Productivity",
  "Email",
  "Calendar",
  "Finance",
  "Legal",
  "Sales",
  "Support",
  "Engineering",
  "Research",
];

const props: SpecimenProp[] = [
  {
    name: "ScrollArea.type",
    type: '"auto" | "always" | "scroll" | "hover"',
    note: 'Radix Root — when the scrollbar shows. Defaults to Radix\'s "hover".',
  },
  {
    name: "ScrollArea.scrollHideDelay",
    type: "number",
    note: "ms before an idle scrollbar fades, for the hover/scroll types.",
  },
  {
    name: "ScrollArea.children",
    type: "React.ReactNode",
    note: "Goes inside the viewport; a vertical ScrollBar is always rendered.",
  },
  {
    name: "ScrollBar.orientation",
    type: '"vertical" | "horizontal"',
    note: 'Defaults to "vertical". Add a horizontal one as a ScrollArea child.',
  },
];

const tokens = ["bg-line", "ring-focus/50"];

function ScrollAreaSpecimen() {
  return (
    <SpecimenPage
      title="ScrollArea"
      intro="A bounded viewport with a thin, themed scrollbar — the rail an agent list or a long panel scrolls inside."
    >
      <SpecimenSection
        title="Variants"
        note="The root always renders a vertical bar; a horizontal one is opted into by adding a second ScrollBar."
      >
        <SpecimenRow label="Vertical (default)">
          <ScrollArea className="h-40 w-64 rounded-xl border border-line">
            <ul className="flex flex-col p-3 text-sm">
              {agents.map((agent) => (
                <li key={agent} className="py-1.5">
                  {agent}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </SpecimenRow>
        <SpecimenRow label="Horizontal">
          <ScrollArea className="w-72 rounded-xl border border-line">
            <div className="flex w-max gap-2 p-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="whitespace-nowrap rounded-full bg-chip px-3 py-1 text-chip-text text-[13px]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </SpecimenRow>
        <SpecimenRow label="Both axes">
          <ScrollArea className="h-40 w-64 rounded-xl border border-line">
            <div className="w-max p-3 text-sm">
              {agents.map((agent) => (
                <p key={agent} className="whitespace-nowrap py-1.5">
                  {agent} — last run 6 minutes ago by @julian
                </p>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The thumb only exists while the content overflows; the viewport itself is focusable and takes a focus ring."
      >
        <SpecimenRow label="Overflowing">
          <ScrollArea className="h-32 w-64 rounded-xl border border-line">
            <ul className="flex flex-col p-3 text-sm">
              {agents.map((agent) => (
                <li key={agent} className="py-1.5">
                  {agent}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </SpecimenRow>
        <SpecimenRow label="Content fits — no thumb">
          <ScrollArea className="h-32 w-64 rounded-xl border border-line">
            <ul className="flex flex-col p-3 text-sm">
              {agents.slice(0, 3).map((agent) => (
                <li key={agent} className="py-1.5">
                  {agent}
                </li>
              ))}
            </ul>
          </ScrollArea>
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
export const sources: string[] = ["ScrollArea", "ScrollBar"];

export const specimen: Specimen = {
  id: "core-scroll-area",
  title: "ScrollArea",
  group: "Structure & nav",
  render: () => <ScrollAreaSpecimen />,
};
