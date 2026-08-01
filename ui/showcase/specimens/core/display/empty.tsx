import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@houston-ai/core";
import { InboxIcon, SearchIcon } from "lucide-react";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function EmptySpecimen() {
  return (
    <SpecimenPage
      title="Empty"
      intro="The nothing-here state: what is missing, why, and the one action that fixes it."
    >
      <SpecimenSection
        title="Variants"
        note="`EmptyMedia` is the only slot with a `variant` prop — `default` (bare glyph) and `icon` (glyph on a tinted tile). Everything else is composition."
      >
        <SpecimenRow label="EmptyMedia default">
          <Empty className="border w-full max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="default">
                <InboxIcon className="size-8 text-ink-muted" />
              </EmptyMedia>
              <EmptyTitle>No agents yet</EmptyTitle>
              <EmptyDescription>
                Hire one from the store and it starts working today.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SpecimenRow>
        <SpecimenRow label="EmptyMedia icon">
          <Empty className="border w-full max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No agents yet</EmptyTitle>
              <EmptyDescription>
                Hire one from the store and it starts working today.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Empty renders `border-dashed` but no border WIDTH — add `border` to see the outline, leave it off for a borderless state inside a card that already has one."
      >
        <SpecimenRow label="With an action">
          <Empty className="border w-full max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>No results for “inbox”</EmptyTitle>
              <EmptyDescription>
                Check the spelling, or browse every agent in the store.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm">Browse the store</Button>
            </EmptyContent>
          </Empty>
        </SpecimenRow>
        <SpecimenRow label="Borderless (inside a card)">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-2">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No runs this week</EmptyTitle>
                <EmptyDescription>
                  Meeting Notes runs when a call starts.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </SpecimenRow>
        <SpecimenRow label="With a link in the description">
          <Empty className="border w-full max-w-md">
            <EmptyHeader>
              <EmptyTitle>Gmail is not connected</EmptyTitle>
              <EmptyDescription>
                Inbox Zero needs mail access.{" "}
                <a href="#core-empty">Connect Gmail</a> to start it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size, two paddings: 24px on mobile, 48px from `md` up. Width always comes from the parent — it is a flex-1 child by default."
      >
        <SpecimenRow label="Narrow parent">
          <div className="w-64">
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Nothing here</EmptyTitle>
                <EmptyDescription>
                  The title balances its lines.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "EmptyMedia variant",
            type: '"default" | "icon"',
            note: 'Defaults to "default". "icon" is a 40px tinted tile; its `<svg>` sizes to 24px.',
          },
          {
            name: "Empty ...props",
            type: 'React.ComponentProps<"div">',
            note: "Centred, balanced-text frame. Dashed border, no border width of its own.",
          },
          {
            name: "EmptyHeader ...props",
            type: 'React.ComponentProps<"div">',
            note: "Media + title + description, capped at `max-w-md`.",
          },
          {
            name: "EmptyTitle ...props",
            type: 'React.ComponentProps<"div">',
            note: "24px semibold headline.",
          },
          {
            name: "EmptyDescription ...props",
            type: 'React.ComponentProps<"p">',
            note: "Muted supporting copy; underlines any `<a>` inside it.",
          },
          {
            name: "EmptyContent ...props",
            type: 'React.ComponentProps<"div">',
            note: "The action slot below the header, capped at `max-w-sm`.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged last on every slot.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-chip-subtle",
          "text-ink",
          "text-ink-muted",
          "text-action",
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
  "Empty",
  "EmptyContent",
  "EmptyDescription",
  "EmptyHeader",
  "EmptyMedia",
  "EmptyTitle",
];

export const specimen: Specimen = {
  id: "core-empty",
  title: "Empty",
  group: "Data display",
  render: () => <EmptySpecimen />,
};
