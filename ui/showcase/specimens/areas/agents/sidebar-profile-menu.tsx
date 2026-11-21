import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  TooltipProvider,
} from "@houston-ai/core";
import {
  SidebarAvatarDiameter,
  SidebarProfileMenu,
  sidebarCollapsedItem,
} from "@houston-ai/layout";
import { Settings } from "lucide-react";
import type { ReactNode } from "react";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { Portrait } from "./app-sidebar-stage";

const PROPS: readonly SpecimenProp[] = [
  {
    name: "avatar",
    type: "ReactNode",
    note: "A round portrait that reads `useSidebarAvatarDiameter()`, like an agent's: 40px on the row, 24px in the icon rail.",
  },
  { name: "title", type: "string", note: "Who is signed in: the name line." },
  {
    name: "subtitle",
    type: "string",
    note: "Where they are (the workspace): the quiet line under the name, so the rail keeps answering 'where am I'.",
  },
  {
    name: "collapsed",
    type: "boolean",
    note: "Icon rail: the portrait alone, both lines in its tooltip. The menu opens to the right instead of upward.",
  },
  {
    name: "children",
    type: "ReactNode",
    note: "The menu's items, host-owned: workspaces, the workspace's tools, the person's own settings.",
  },
  {
    name: "dataAttrs",
    type: "Record<string, string>",
    note: "DOM attributes (a tour anchor) on the trigger's wrapper.",
  },
];

function Foot({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div
      className={`rounded-xl bg-sidebar pt-2 ${narrow ? "w-[56px]" : "w-[272px]"}`}
    >
      {children}
    </div>
  );
}

function Menu({ collapsed }: { collapsed?: boolean }) {
  return (
    <SidebarProfileMenu
      avatar={<Portrait initials="JA" />}
      title="Julian Arango"
      subtitle="Houston HQ"
      collapsed={collapsed}
    >
      <DropdownMenuItem>Houston HQ</DropdownMenuItem>
      <DropdownMenuItem>Taxflow</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <Settings className="size-4" />
        Settings
      </DropdownMenuItem>
    </SidebarProfileMenu>
  );
}

function SidebarProfileMenuSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="SidebarProfileMenu"
        intro="The foot of the rail, drawn the way macOS draws an account: a round portrait, the name, and the workspace under it. Pressing it opens the menu that holds everything that is not an agent."
      >
        <SpecimenSection
          title="Variants"
          note="The same person row as every agent above it (64px, a 40px portrait, a semibold name over a muted line), with no chevron and no frame. Collapsed, the portrait alone."
        >
          <SpecimenRow label="Expanded: open the menu upward">
            <Foot>
              <Menu />
            </Foot>
          </SpecimenRow>
          <SpecimenRow label="Collapsed: the portrait opens it to the right">
            <Foot narrow>
              <SidebarAvatarDiameter
                value={sidebarCollapsedItem.avatarDiameter}
              >
                <Menu collapsed />
              </SidebarAvatarDiameter>
            </Foot>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={PROPS} />

        <SpecimenTokens
          classes={[
            "bg-sidebar-hover",
            "text-ink",
            "text-ink-muted",
            "ring-focus",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = ["SidebarProfileMenu"];

export const specimen: Specimen = {
  id: "agents-sidebar-profile-menu",
  title: "SidebarProfileMenu",
  group: "Your Agents",
  render: () => <SidebarProfileMenuSpecimen />,
};
