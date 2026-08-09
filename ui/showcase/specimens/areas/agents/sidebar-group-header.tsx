import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { SIDEBAR_GROUP_HEADER_PROPS } from "./sidebar-group-header-api";
import { LiveTeam, Rail } from "./sidebar-group-header-parts";

function SidebarGroupHeaderSpecimen() {
  return (
    <SpecimenPage
      title="SidebarGroupHeader"
      intro="The head of a team block: one button carrying the team's glyph, its name, the disclosure triangle and its rollup badge, with the ⋯ menu beside it."
    >
      <SpecimenSection
        title="Anatomy"
        note="One button, not three. The triangle, the glyph and the name used to be separate controls sharing a single job, which gave a keyboard user three stops to reach one disclosure and a screen reader no aria-expanded at all. Now the row IS the single hit target, and the menu sits beside it because a button may not nest inside a button. The triangle is an indicator, not a control: what activating the row does is the host's rule, so a triangle claiming to be the fold button would promise an outcome it does not own. The row wears the same 28px box and the same pill as the member rows under it, so a team reads as the head of its ladder rather than as chrome above one — its glyph simply sits 12px to their left."
      >
        <SpecimenRow label="Named team — click the row to fold it">
          <Rail>
            <LiveTeam name="Mornings" owns />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Default team — no menu, no drag handle">
          <Rail>
            <LiveTeam name="Julian's workspace" menu={false} />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Monochrome glyph — colour belongs to the avatars below">
          <Rail>
            <LiveTeam name="Finance" />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Folding hides EVERYTHING under the header. The hole that leaves is answered by the header itself: it wears the selected pill whenever the block owns the open view, and its trailing slot rolls up what the hidden rows were signalling, so folding a team never means losing sight of it. Rename swaps the row for an input that commits on Enter or blur and abandons on Escape, reporting every abandonment exactly once, which is how a team that does not exist yet knows to disappear."
      >
        <SpecimenRow label="Expanded and collapsed — fold either one">
          <Rail>
            <LiveTeam name="Mornings" />
            <LiveTeam name="Finance" startCollapsed />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Active — the block owns the open view">
          <Rail>
            <LiveTeam name="Mornings" owns />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Collapsed and active — the header stands in for it">
          <Rail>
            <LiveTeam name="Mornings" owns startCollapsed />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={SIDEBAR_GROUP_HEADER_PROPS} />

      <SpecimenTokens
        classes={[
          "bg-sidebar",
          "bg-sidebar-active",
          "bg-hover",
          "text-hover-text",
          "text-ink",
          "text-ink-muted",
          "bg-input",
          "border-line",
          "text-danger",
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
export const sources: string[] = ["SidebarGroupHeader"];

export const specimen: Specimen = {
  id: "agents-sidebar-group-header",
  title: "SidebarGroupHeader",
  group: "Your Agents",
  render: () => <SidebarGroupHeaderSpecimen />,
};
