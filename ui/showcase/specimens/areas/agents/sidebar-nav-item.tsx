import { Badge, TooltipProvider } from "@houston-ai/core";
import { SidebarNavItem } from "@houston-ai/layout";
import { LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { navEntries } from "./sample";
import { SIDEBAR_NAV_ITEM_PROPS } from "./sidebar-nav-item-api";

/** Nav items paint on the rail, so they are only honest on the rail's fill. */
function Rail({
  children,
  collapsed,
}: {
  children: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <div
      className={
        collapsed
          ? "flex w-[56px] flex-col items-center gap-0.5 rounded-xl bg-sidebar px-2 py-2"
          : "w-[220px] space-y-0.5 rounded-xl bg-sidebar px-2 py-2"
      }
    >
      {children}
    </div>
  );
}

/** The four destinations, with the click actually moving the highlight. */
function LiveNav({ collapsed }: { collapsed?: boolean }) {
  const [activeId, setActiveId] = useState("dashboard");
  return (
    <Rail collapsed={collapsed}>
      {navEntries.map((entry) => (
        <SidebarNavItem
          key={entry.id}
          icon={<entry.icon className="size-4" />}
          label={entry.label}
          active={entry.id === activeId}
          onClick={() => setActiveId(entry.id)}
          collapsed={collapsed}
        />
      ))}
    </Rail>
  );
}

function SidebarNavItemSpecimen() {
  const noop = () => undefined;
  const [dashboard, integrations, store] = navEntries;
  return (
    <TooltipProvider>
      <SpecimenPage
        title="SidebarNavItem"
        intro="One destination above the agent list — Mission Control, Integrations, the Agent Store, Settings. Expanded it is a SidebarRowButton at block depth, so it shares its 28px box, its glyph column and its pill with every team header below it."
      >
        <SpecimenSection
          title="Variants"
          note="No `variant` prop. A nav item is an icon, a label and an optional right-aligned slot; `collapsed` is the only structural fork, and it is a genuinely different anatomy rather than a narrower row. Click either list — the highlight is live."
        >
          <SpecimenRow label="Expanded">
            <LiveNav />
          </SpecimenRow>
          <SpecimenRow label="Collapsed — the label becomes a tooltip">
            <LiveNav collapsed />
          </SpecimenRow>
          <SpecimenRow label="With a trailing badge">
            <Rail>
              <SidebarNavItem
                icon={<LayoutDashboard className="size-4" />}
                label="Mission Control"
                onClick={noop}
                trailing={<Badge variant="outline">Beta</Badge>}
              />
            </Rail>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="Two, and `active` is the only one that is a prop: the sidebar-active fill plus text-ink. Weight is NOT part of it — a nav row is block-level and therefore always medium, so clicking one cannot re-measure its label. Rest picks up the hover fill on pointer-over; there is no disabled state, because a destination the user cannot reach is not rendered."
        >
          <SpecimenRow label="Rest (hover me) / active">
            <Rail>
              <SidebarNavItem
                icon={<integrations.icon className="size-4" />}
                label={integrations.label}
                onClick={noop}
              />
              <SidebarNavItem
                icon={<dashboard.icon className="size-4" />}
                label={dashboard.label}
                active
                onClick={noop}
              />
            </Rail>
          </SpecimenRow>
          <SpecimenRow label="Collapsed: rest / active">
            <Rail collapsed>
              <SidebarNavItem
                icon={<integrations.icon className="size-4" />}
                label={integrations.label}
                onClick={noop}
                collapsed
              />
              <SidebarNavItem
                icon={<dashboard.icon className="size-4" />}
                label={dashboard.label}
                active
                onClick={noop}
                collapsed
              />
            </Rail>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="One size per mode: the shared full-width 28px row expanded, a 36px square in the icon rail. The icon is the caller's — every Houston nav entry passes a 16px Lucide glyph, and the row reserves the same 20px box for it that a team glyph and an agent avatar get."
        >
          <SpecimenRow label="Full width vs. 36px square">
            <Rail>
              <SidebarNavItem
                icon={<store.icon className="size-4" />}
                label={store.label}
                active
                onClick={noop}
              />
            </Rail>
            <Rail collapsed>
              <SidebarNavItem
                icon={<store.icon className="size-4" />}
                label={store.label}
                active
                onClick={noop}
                collapsed
              />
            </Rail>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={SIDEBAR_NAV_ITEM_PROPS} />

        <SpecimenTokens
          classes={["bg-sidebar-active", "bg-hover", "text-ink"]}
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
export const sources: string[] = ["SidebarNavItem"];

export const specimen: Specimen = {
  id: "agents-sidebar-nav-item",
  title: "SidebarNavItem",
  group: "Your Agents",
  render: () => <SidebarNavItemSpecimen />,
};
