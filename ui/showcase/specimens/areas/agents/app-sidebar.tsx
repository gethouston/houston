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
import { LiveSidebar } from "./app-sidebar-parts";
import { EmptyRail, SidebarStage } from "./app-sidebar-stage";

function AppSidebarSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="AppSidebar"
        intro="The rail the whole product hangs off: a top line for the host's verbs, every AI Employee the user has (Houston pinned first, the “Add new AI Employee” shortcut closing the list), and a foot for the connect rows and the account."
      >
        <SpecimenSection
          title="Variants"
          note="No `variant` prop. The rail's shape is which slots it is given — and one decision: pass `groups` and the flat list becomes the grouped drag-and-drop layout. Add an `icon` to a group and each block becomes a team: one header row, then its agents. Every example below is live; select, fold and drag them."
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
          <SpecimenRow label="Teams — one ladder of rows per block">
            <SidebarStage>
              <LiveSidebar grouped teams />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Full shell chrome: top-line verbs and the account foot">
            <SidebarStage>
              <LiveSidebar chrome grouped teams />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Window controls inset — expand and collapse the rail">
            <SidebarStage>
              <LiveSidebar chrome windowControlsInset />
              <LiveSidebar chrome windowControlsInset startCollapsed />
            </SidebarStage>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Anatomy"
          note="Agent rows are laid out like a message list: a 40px portrait, the name in semibold, one or two muted lines under it and a badge at the end, with a hairline between rows that drops away around a hovered or selected row. A team row is one hit target (glyph, name, triangle and rollup badge together) and its glyph is monochrome on purpose: the identity colour belongs to the agent avatars."
        >
          <SpecimenRow label="Expanded team, collapsed team, ungrouped top-level agents">
            <SidebarStage>
              <LiveSidebar grouped teams />
            </SidebarStage>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="Selection is one paint for every kind of row: a team header and an agent row wear the same pill, so “where am I” reads the same whichever is open. Folding a team hides everything under it — its header keeps the pill and picks up a rollup badge, so the rail never goes dark on the question. Rows carry no menu at all: a team's name and mark are changed in the host's own dialog, and an agent is renamed, recoloured, moved and deleted on its focused agent screen, so the rail keeps one door onto each and its full width for names."
        >
          <SpecimenRow label="Selected, running, needs-you, unread">
            <SidebarStage>
              <LiveSidebar />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Active team header — the block owns the open view">
            <SidebarStage>
              <LiveSidebar grouped teams />
            </SidebarStage>
          </SpecimenRow>
          <SpecimenRow label="Collapsed and active — Finance holds the open agent">
            <SidebarStage>
              <LiveSidebar grouped teams initialSelectedId="weekly-report" />
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
          note="The expanded rail is 272px. The collapsed rail is 56px, or 84px with a window controls inset. Width changes use a 200ms transition. Height comes from the parent."
        >
          <SpecimenRow label="272px or 56px: click the panel button to switch">
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
            "bg-card",
            "bg-input",
            "border-line",
            "border-ink",
            "ring-line",
            "text-danger",
            "ring-focus",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = [
  "AppSidebar",
  "SidebarAddRow",
  "SidebarConnectGroup",
];

export const specimen: Specimen = {
  id: "agents-app-sidebar",
  title: "AppSidebar",
  group: "Your Agents",
  render: () => <AppSidebarSpecimen />,
};
