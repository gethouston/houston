import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
} from "@houston-ai/core";
import { Inbox } from "lucide-react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { sidebarProps, sidebarTokens } from "./sidebar-api";
import { ComposedSidebar, SidebarPlate, SidebarScope } from "./sidebar-parts";

function SidebarSpecimen() {
  return (
    <SpecimenPage
      title="Sidebar"
      intro="The app's navigation rail: a provider, a collapsible frame, and the menu parts that fill it."
    >
      <SpecimenSection
        title="Variants"
        note='The one variant prop with styles behind it is SidebarMenuButton.variant. The frame props — side, variant, collapsible — position a fixed, full-height rail, so they only read true inside an app shell; the composition below runs collapsible="none", the mode that lays out in flow.'
      >
        <SpecimenRow label='variant="default"'>
          <SidebarPlate>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Inbox />
                <span>Inbox Zero</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarPlate>
        </SpecimenRow>
        <SpecimenRow label='variant="outline"'>
          <SidebarPlate>
            <SidebarMenuItem>
              <SidebarMenuButton variant="outline">
                <Inbox />
                <span>Inbox Zero</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarPlate>
        </SpecimenRow>
        <SpecimenRow label="Composed rail">
          <ComposedSidebar />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="A row is resting, current (isActive), or unavailable. The trigger toggles the rail — ⌘B does the same."
      >
        <SpecimenRow label="Resting / active / disabled">
          <SidebarPlate>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Inbox />
                <span>Meeting Notes</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive>
                <Inbox />
                <span>Inbox Zero</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton disabled>
                <Inbox />
                <span>Weekly Report</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarPlate>
        </SpecimenRow>
        <SpecimenRow label="Loading">
          <SidebarPlate>
            <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuSkeleton />
            </SidebarMenuItem>
          </SidebarPlate>
        </SpecimenRow>
        <SpecimenRow label="Trigger">
          <SidebarScope>
            <SidebarTrigger />
          </SidebarScope>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Three row heights on the menu button, two on the sub-button."
      >
        <SpecimenRow label="default · sm · lg">
          <SidebarPlate>
            <SidebarMenuItem>
              <SidebarMenuButton size="default">
                <Inbox />
                <span>default — 32px</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton size="sm">
                <Inbox />
                <span>sm — 28px</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <Inbox />
                <span>lg — 48px</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarPlate>
        </SpecimenRow>
        <SpecimenRow label="Sub-button md · sm">
          <SidebarPlate>
            <SidebarMenuItem>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton>Run 142 — md</SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton size="sm">
                    Run 141 — sm
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>
          </SidebarPlate>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={sidebarProps} />
      <SpecimenTokens classes={sidebarTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Sidebar",
  "SidebarContent",
  "SidebarFooter",
  "SidebarGroup",
  "SidebarGroupAction",
  "SidebarGroupContent",
  "SidebarGroupLabel",
  "SidebarHeader",
  "SidebarInput",
  "SidebarMenu",
  "SidebarMenuAction",
  "SidebarMenuBadge",
  "SidebarMenuButton",
  "SidebarMenuItem",
  "SidebarMenuSkeleton",
  "SidebarMenuSub",
  "SidebarMenuSubButton",
  "SidebarMenuSubItem",
  "SidebarProvider",
  "SidebarSeparator",
  "SidebarTrigger",
];

export const specimen: Specimen = {
  id: "core-sidebar",
  title: "Sidebar",
  group: "Structure & nav",
  render: () => <SidebarSpecimen />,
};
