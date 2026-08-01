import { TooltipProvider } from "@houston-ai/core";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { APP_SIDEBAR_PROPS } from "./app-sidebar-api";
import { EmptyRail, LiveSidebar, SidebarStage } from "./app-sidebar-parts";

function AppSidebarSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="AppSidebar"
        intro="The rail the whole product hangs off: the workspace switcher, the destinations, and every agent the user has."
      >
        <SpecimenSection
          title="Variants"
          note="No `variant` prop. The rail's shape is which slots it is given — and one decision: pass `groups` and the flat list becomes the grouped drag-and-drop layout. Every example below is live; rename, delete, collapse and drag them."
        >
          <SpecimenRow label="Flat list">
            <SidebarStage>
              <LiveSidebar />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Grouped — drag an agent between groups">
            <SidebarStage>
              <LiveSidebar grouped />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Full shell chrome — header, nav, footer">
            <SidebarStage>
              <LiveSidebar chrome grouped />
            </SidebarStage>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="Row state comes from `selectedId` and each item's `trailing` node; the rail itself paints only the selection fill. Rename is inline — open a row's ⋯ menu and pick Rename, and the row swaps for a focused input that commits on Enter or blur."
        >
          <SpecimenRow label="Selected, running, needs-you, unread">
            <SidebarStage>
              <LiveSidebar />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Empty — a brand-new workspace">
            <SidebarStage>
              <EmptyRail />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Collapsed rail — hover a glyph for its flyout">
            <SidebarStage>
              <LiveSidebar chrome startCollapsed />
            </SidebarStage>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="Two widths, and they are the component's own: 220px expanded, 56px collapsed, with a 200ms width transition between them. Height always comes from the parent."
        >
          <SpecimenRow label="220px ↔ 56px — click the panel button to switch">
            <SidebarStage>
              <LiveSidebar chrome />
            </SidebarStage>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={APP_SIDEBAR_PROPS} />

        <SpecimenTokens
          classes={[
            "bg-sidebar",
            "text-sidebar-text",
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
    </TooltipProvider>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["AppSidebar"];

export const specimen: Specimen = {
  id: "agents-app-sidebar",
  title: "AppSidebar",
  group: "Your Agents",
  render: () => <AppSidebarSpecimen />,
};
