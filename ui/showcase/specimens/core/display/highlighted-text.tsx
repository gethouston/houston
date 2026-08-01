import { HighlightedText } from "@houston-ai/core";
import type { ReactNode } from "react";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

const MISSION = "Inbox Zero triaged 41 emails and drafted 6 replies";
/** The two spans a search for the mission's agent and verb would return. */
const MATCHES = [
  { start: 0, end: 10 },
  { start: 33, end: 40 },
];

/** One line of sample text, rendered at body scale so the mark reads in context. */
function Line({ children }: { children: ReactNode }) {
  return (
    <span className="text-[15px] leading-[1.55] text-ink">{children}</span>
  );
}

function HighlightedTextSpecimen() {
  return (
    <SpecimenPage
      title="HighlightedText"
      intro="Search matches, marked in place. Pure presentation: the caller decides which spans matched."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — the only axis is which ranges you hand it. It returns a Fragment, so it drops straight into a truncating parent."
      >
        <SpecimenRow label="One range">
          <Line>
            <HighlightedText text={MISSION} ranges={[{ start: 0, end: 10 }]} />
          </Line>
        </SpecimenRow>
        <SpecimenRow label="Several ranges">
          <Line>
            <HighlightedText text={MISSION} ranges={MATCHES} />
          </Line>
        </SpecimenRow>
        <SpecimenRow label="No ranges (plain text)">
          <Line>
            <HighlightedText text={MISSION} />
          </Line>
        </SpecimenRow>
        <SpecimenRow label="Custom markClassName">
          <Line>
            <HighlightedText
              text={MISSION}
              ranges={[{ start: 0, end: 10 }]}
              markClassName="font-semibold"
            />
          </Line>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Every malformed input is tolerated rather than thrown: ranges are clamped, empties dropped, unsorted input sorted, and overlaps merged into one mark."
      >
        <SpecimenRow label="Unsorted input">
          <Line>
            <HighlightedText
              text={MISSION}
              ranges={[
                { start: 33, end: 40 },
                { start: 0, end: 10 },
              ]}
            />
          </Line>
        </SpecimenRow>
        <SpecimenRow label="Overlapping → merged">
          <Line>
            <HighlightedText
              text={MISSION}
              ranges={[
                { start: 0, end: 6 },
                { start: 4, end: 10 },
              ]}
            />
          </Line>
        </SpecimenRow>
        <SpecimenRow label="Out of bounds → clamped">
          <Line>
            <HighlightedText
              text={MISSION}
              ranges={[{ start: 33, end: 900 }]}
            />
          </Line>
        </SpecimenRow>
        <SpecimenRow label="Empty range → dropped">
          <Line>
            <HighlightedText text={MISSION} ranges={[{ start: 5, end: 5 }]} />
          </Line>
        </SpecimenRow>
        <SpecimenRow label="Inside a truncating row">
          <span className="block w-64 truncate text-[15px] leading-[1.55] text-ink">
            <HighlightedText
              text="Weekly Report pulled the numbers and wrote the update"
              ranges={[{ start: 0, end: 13 }]}
            />
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="No size of its own: the `<mark>` inherits the surrounding type scale and only adds 2px of horizontal padding."
      >
        <SpecimenRow label="Meta scale (13px)">
          <span className="text-[13px] leading-[1.4] text-ink-muted">
            <HighlightedText
              text="Published by @julian · 2 days ago"
              ranges={[{ start: 13, end: 20 }]}
            />
          </span>
        </SpecimenRow>
        <SpecimenRow label="Body scale (15px)">
          <Line>
            <HighlightedText
              text="Published by @julian · 2 days ago"
              ranges={[{ start: 13, end: 20 }]}
            />
          </Line>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "text",
            type: "string",
            note: "The full string to render. Required.",
          },
          {
            name: "ranges",
            type: "HighlightRange[]",
            note: "`{ start, end }` in UTF-16 code units; end exclusive. Optional — omit for plain text.",
          },
          {
            name: "markClassName",
            type: "string",
            note: "Merged onto every `<mark>`.",
          },
        ]}
      />

      <SpecimenTokens classes={["bg-highlight", "text-highlight-text"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["HighlightedText"];

export const specimen: Specimen = {
  id: "core-highlighted-text",
  title: "HighlightedText",
  group: "Data display",
  render: () => <HighlightedTextSpecimen />,
};
