import { TooltipProvider } from "@houston-ai/core";
import { WorkspaceSwitcher } from "@houston-ai/layout";
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
import { workspaces } from "./sample";
import { WORKSPACE_SWITCHER_PROPS } from "./workspace-switcher-api";

/** The switcher is the top of the rail, so it only reads on the rail's fill. */
function RailTop({
  children,
  collapsed,
}: {
  children: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-sidebar pb-2 ${collapsed ? "w-[56px]" : "w-[220px]"}`}
    >
      {children}
    </div>
  );
}

/** Switching workspaces actually switches — the trigger renames itself. */
function LiveSwitcher({ collapsed }: { collapsed?: boolean }) {
  const [currentId, setCurrentId] = useState("personal");
  const current =
    workspaces.find((one) => one.id === currentId) ?? workspaces[0];
  return (
    <WorkspaceSwitcher
      workspaces={[...workspaces]}
      currentId={current.id}
      currentName={current.name}
      onSwitch={setCurrentId}
      onCreate={() => setCurrentId("personal")}
      collapsed={collapsed}
    />
  );
}

function WorkspaceSwitcherSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="WorkspaceSwitcher"
        intro="The name of the space you are in, and the menu that moves you to another one or starts a new one."
      >
        <SpecimenSection
          title="Variants"
          note="The expanded name row and collapsed monogram both open the workspace menu. The sidebar header owns its separate collapse and expand control."
        >
          <SpecimenRow label="Expanded — open the menu">
            <RailTop>
              <LiveSwitcher />
            </RailTop>
          </SpecimenRow>
          <SpecimenRow label="Collapsed — monogram opens the same menu">
            <RailTop collapsed>
              <LiveSwitcher collapsed />
            </RailTop>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="The trigger has one resting look and a hover fill. The current workspace is marked inside the menu by weight alone, never by a checkmark; a name too long for the rail truncates rather than wrapping."
        >
          <SpecimenRow label="Current marked in the open menu">
            <RailTop>
              <LiveSwitcher />
            </RailTop>
          </SpecimenRow>
          <SpecimenRow label="Long name truncates">
            <RailTop>
              <WorkspaceSwitcher
                workspaces={[...workspaces]}
                currentId="taxflow"
                currentName="Taxflow — Accounting & Bookkeeping Team"
                onSwitch={() => undefined}
                onCreate={() => undefined}
              />
            </RailTop>
          </SpecimenRow>
          <SpecimenRow label="Monogram falls back to ? on a blank name">
            <RailTop collapsed>
              <WorkspaceSwitcher
                workspaces={[...workspaces]}
                currentId={null}
                currentName="   "
                onSwitch={() => undefined}
                onCreate={() => undefined}
                collapsed
              />
            </RailTop>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="One size in each mode: a full-width row expanded, a 36px monogram square collapsed. The empty padding around each control carries `data-tauri-drag-region`; buttons keep their clicks. On macOS desktop, the rail reserves a separate 40px controls row above the compact switcher, and the content gutter also drags the window."
        >
          <SpecimenRow label="220px row vs. 36px monogram">
            <RailTop>
              <LiveSwitcher />
            </RailTop>
            <RailTop collapsed>
              <LiveSwitcher collapsed />
            </RailTop>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={WORKSPACE_SWITCHER_PROPS} />

        <SpecimenTokens
          classes={["bg-hover", "text-ink", "text-ink-muted", "ring-focus"]}
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
export const sources: string[] = ["WorkspaceSwitcher"];

export const specimen: Specimen = {
  id: "agents-workspace-switcher",
  title: "WorkspaceSwitcher",
  group: "Your Agents",
  render: () => <WorkspaceSwitcherSpecimen />,
};
