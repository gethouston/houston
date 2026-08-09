import { SidebarRowButton } from "@houston-ai/layout";
import { LayoutDashboard, Plus, Users } from "lucide-react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { SIDEBAR_ROW_BUTTON_PROPS } from "./sidebar-row-button-api";
import { ConsumerList, Ladder, Rail } from "./sidebar-row-button-parts";

function SidebarRowButtonSpecimen() {
  const noop = () => undefined;
  return (
    <SpecimenPage
      title="SidebarRowButton"
      intro="THE rail row. Every interactive line in the sidebar is one of these — the top-level destinations, the band that names the list, each team header, each destination row, each agent, and the row that closes the list."
    >
      <SpecimenSection
        title="Anatomy"
        note="A fixed 28px box, a 20px glyph column, a truncating label, an optional trailing slot inside the button and an optional affordance beside it. The pill is INSET 6px from each edge and rounded on the same radius the team screen's section lozenges wear, so it reads as a row floating on the rail rather than as a bar cut across it. It is painted on a layer of its own, behind the content, which is what lets it be inset without dragging the glyph column with it: hierarchy stays the indent INSIDE a full-width button, so the pills line up in one clean column instead of stepping in and out with their contents. Click anything — the highlight is live."
      >
        <SpecimenRow label="One block, every row kind">
          <Ladder />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Depth"
        note="Two indents and only two. `block` sits at the rail's edge and is medium; `child` hangs 12px to its right and is regular. Both are 13px. Weight states the DEPTH, never the state, so selecting a row cannot re-measure its label and shift where a long name truncates."
      >
        <SpecimenRow label="block / child">
          <Rail>
            <SidebarRowButton
              label="Operations"
              depth="block"
              icon={<Users className="size-4" />}
              onActivate={noop}
            />
            <SidebarRowButton
              label="Mission Control"
              icon={<LayoutDashboard className="size-4" />}
              onActivate={noop}
            />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Rest, hover, focus and active, and a row can be active AND a disclosure at once: that is a collapsed team standing in for the destination row it is hiding, so the rail never goes dark on the question of where you are. Hover is `bg-sidebar-hover` (6%) against the pill's `bg-sidebar-active` (10%): a ratio, so the row under the cursor is unmistakable without ever passing for the selected one. Focus rides the same inset layer, so the ring traces the pill instead of a rectangle wider than the fill it is outlining. `muted` is not a state but a role — a row that names things rather than opening one."
      >
        <SpecimenRow label="Rest (hover me) / active / muted">
          <Rail>
            <SidebarRowButton
              label="Routines"
              icon={<LayoutDashboard className="size-4" />}
              onActivate={noop}
            />
            <SidebarRowButton
              label="Mission Control"
              icon={<LayoutDashboard className="size-4" />}
              active
              onActivate={noop}
            />
            <SidebarRowButton
              label="New agent"
              muted
              icon={<Plus className="size-4" />}
              onActivate={noop}
            />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Collapsed and active — the header stands in">
          <Rail>
            <SidebarRowButton
              label="Operations"
              depth="block"
              icon={<Users className="size-4" />}
              active
              disclosure={{ expanded: false }}
              onActivate={noop}
            />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Type"
        note="Two sizes and no more. Every row that points at something is 13px; the band that merely names the list is 12px, and never carries a block head's weight. A third size, or a semibold band, and the rail stops reading as one list and starts reading as a form."
      >
        <SpecimenRow label="13px item / 12px band">
          <Rail>
            <SidebarRowButton
              label="Your teams"
              depth="block"
              band
              disclosure={{ expanded: true }}
              onActivate={noop}
            />
            <SidebarRowButton
              label="Operations"
              depth="block"
              icon={<Users className="size-4" />}
              disclosure={{ expanded: true }}
              onActivate={noop}
            />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Disclosure"
        note="A small FILLED triangle, immediately after the label, rotating a quarter turn in 150ms. Filled, because a solid triangle says 'this is closed' where an outline chevron says 'there is more over there'. Beside the words rather than at the row's far edge, because a mark a whole gap away reads as a separate control instead of as the label's own state. There is no placement option to get wrong."
      >
        <SpecimenRow label="Collapsed / expanded">
          <Rail>
            <SidebarRowButton
              label="Operations"
              depth="block"
              icon={<Users className="size-4" />}
              disclosure={{ expanded: false }}
              onActivate={noop}
            />
            <SidebarRowButton
              label="Operations"
              depth="block"
              icon={<Users className="size-4" />}
              disclosure={{ expanded: true }}
              onActivate={noop}
            />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Who draws through it"
        note="The list IS the design. A module that hand-rolls a row is how the rail went back to reading as several stacked lists, so ui/layout's anatomy test asserts this same set against the source."
      >
        <SpecimenRow label="Every rail row in the product">
          <ConsumerList />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={SIDEBAR_ROW_BUTTON_PROPS} />

      <SpecimenTokens
        classes={[
          "bg-sidebar",
          "bg-sidebar-active",
          "bg-sidebar-hover",
          "text-hover-text",
          "text-ink",
          "text-ink-muted",
          "ring-focus",
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
export const sources: string[] = ["SidebarRowButton"];

export const specimen: Specimen = {
  id: "agents-sidebar-row-button",
  title: "SidebarRowButton",
  group: "Your Agents",
  render: () => <SidebarRowButtonSpecimen />,
};
