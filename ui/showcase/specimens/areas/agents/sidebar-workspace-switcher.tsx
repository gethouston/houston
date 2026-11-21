import { DropdownMenuItem, TooltipProvider } from "@houston-ai/core";
import {
  SidebarConnectGroup,
  SidebarWorkspaceSwitcher,
} from "@houston-ai/layout";
import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { connectRows, Who } from "./app-sidebar-foot";
import { workspaces } from "./sample";

const PROPS: readonly SpecimenProp[] = [
  {
    name: "title",
    type: "string",
    note: "The workspace's name: the row's words, truncating, and its accessible name.",
  },
  {
    name: "header",
    type: "ReactNode",
    note: "Who is signed in, heading the open menu above the items, not interactive. Omit it when there is no identity.",
  },
  {
    name: "children",
    type: "ReactNode",
    note: "The menu's items, host-owned: the workspaces and creating one.",
  },
  {
    name: "dataAttrs",
    type: "Record<string, string>",
    note: "DOM attributes (a tour anchor, a test id) on the trigger button.",
  },
];

function Switcher() {
  const [workspaceId, setWorkspaceId] = useState("houston");
  const current =
    workspaces.find((one) => one.id === workspaceId) ?? workspaces[0];
  return (
    <SidebarWorkspaceSwitcher title={current.name} header={<Who />}>
      {workspaces.map((one) => (
        <DropdownMenuItem key={one.id} onSelect={() => setWorkspaceId(one.id)}>
          {one.id === workspaceId ? (
            <Check className="size-4" />
          ) : (
            <span className="size-4" />
          )}
          {one.name}
        </DropdownMenuItem>
      ))}
    </SidebarWorkspaceSwitcher>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-[360px] flex-col rounded-3xl bg-popover py-2">
      {children}
    </div>
  );
}

function SidebarWorkspaceSwitcherSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="SidebarWorkspaceSwitcher"
        intro="The head of the phone's More card: which workspace this is, as the card's own row. Pressing it opens the workspace menu downward, headed by who is signed in. The desktop rail names the workspace on its account row instead."
      >
        <SpecimenSection
          title="Variants"
          note="A 48px card row: the name at 16px and an up-down chevron, no mark."
        >
          <SpecimenRow label="Open the menu downward">
            <Card>
              <Switcher />
            </Card>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Heading the card"
          note="Over the connect group on the same `sheet` surface (`SidebarConnectGroup`: the stacked logo tiles, the label, the count), every row on one 16px left edge."
        >
          <SpecimenRow label="The card's head">
            <Card>
              <Switcher />
              <SidebarConnectGroup rows={connectRows} surface="sheet" />
            </Card>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={PROPS} />

        <SpecimenTokens
          classes={[
            "bg-popover",
            "bg-hover",
            "text-ink",
            "text-ink-muted",
            "ring-focus",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = [
  "SidebarWorkspaceSwitcher",
  "SidebarConnectGroup",
];

export const specimen: Specimen = {
  id: "agents-sidebar-workspace-switcher",
  title: "SidebarWorkspaceSwitcher",
  group: "Your Agents",
  render: () => <SidebarWorkspaceSwitcherSpecimen />,
};
