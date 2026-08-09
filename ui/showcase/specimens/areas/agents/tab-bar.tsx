import { Button } from "@houston-ai/core";
import type { TabBarProps } from "@houston-ai/layout";
import { TabBar } from "@houston-ai/layout";
import { Play, Settings2 } from "lucide-react";
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
import { TAB_BAR_PROPS } from "./tab-bar-api";

/** The tab bar owns no fill of its own — it sits on whatever surface mounts it. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-gutter pb-4">
      {children}
    </div>
  );
}

/**
 * A representative set, kept from the deleted per-agent tab strip so the
 * specimen shows a realistic label mix. These are NOT live product surfaces:
 * the tab shell is gone (those screens are team sections and agent-settings
 * sections now) and no app code mounts `TabBar` any more.
 */
const agentTabs: TabBarProps["tabs"] = [
  { id: "activity", label: "Activity", badge: 3 },
  { id: "context", label: "Context" },
  { id: "skills", label: "Skills" },
  { id: "routines", label: "Routines" },
  { id: "files", label: "Files" },
  { id: "admin", label: "Admin" },
];

function LiveTabs({
  tabs = agentTabs,
  title,
  actions,
  menu,
}: {
  tabs?: TabBarProps["tabs"];
  title?: string;
  actions?: ReactNode;
  menu?: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState("activity");
  return (
    <Stage>
      <TabBar
        title={title}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={actions}
        menu={menu}
      />
    </Stage>
  );
}

function TabBarSpecimen() {
  return (
    <SpecimenPage
      title="TabBar"
      intro="A horizontal strip: an optional title row, and the tabs that switch what you are looking at. A library primitive — the Houston app mounts none today (it used to be the per-agent tab strip), so this page is its contract, not a screenshot of the product."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop. The title row appears only when `title`, `menu` or `actions` is given — with none of them the component is the tab strip alone. Every strip below is live."
      >
        <SpecimenRow label="Strip only">
          <LiveTabs />
        </SpecimenRow>
        <SpecimenRow label="With a title">
          <LiveTabs title="Inbox Zero" />
        </SpecimenRow>
        <SpecimenRow label="Title, menu and actions">
          <LiveTabs
            title="Meeting Notes"
            menu={
              <Button variant="ghost" size="icon" aria-label="Agent options">
                <Settings2 />
              </Button>
            }
            actions={
              <Button size="sm">
                <Play /> Run now
              </Button>
            }
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="A tab is active, at rest, or disabled. Active gets medium weight and the 2px underline; rest lifts to full ink on hover. Disabled is muted and non-clickable, and it drops the underline even when it is the active id."
      >
        <SpecimenRow label="Badge — filled on the active tab, quiet elsewhere">
          <LiveTabs
            tabs={[
              { id: "activity", label: "Activity", badge: 3 },
              { id: "board", label: "Board", badge: 12 },
              { id: "chat", label: "Chat", badge: 0 },
            ]}
          />
        </SpecimenRow>
        <SpecimenRow label="Chip — a tab that exists but is not open yet">
          <LiveTabs
            tabs={[
              { id: "activity", label: "Activity" },
              { id: "skills", label: "Skills" },
              { id: "learnings", label: "Learnings", chip: "Soon" },
            ]}
          />
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <LiveTabs
            tabs={[
              { id: "activity", label: "Activity" },
              { id: "integrations", label: "Integrations" },
              {
                id: "agent-permissions",
                label: "Permissions",
                disabled: true,
              },
            ]}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size: 14px labels on a 20px gap, 10px above and 10px of underline room below. The strip does not scroll — a consumer that outgrows the width must drop tabs before passing them in."
      >
        <SpecimenRow label="Two tabs / a longer set">
          <LiveTabs
            title="Weekly Report"
            tabs={[
              { id: "activity", label: "Activity" },
              { id: "chat", label: "Chat" },
            ]}
          />
          <LiveTabs title="Expense Filer" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={TAB_BAR_PROPS} />

      <SpecimenTokens
        classes={[
          "text-ink",
          "text-ink-muted",
          "bg-hover",
          "text-hover-text",
          "bg-action",
          "text-action-text",
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
export const sources: string[] = ["TabBar"];

export const specimen: Specimen = {
  id: "agents-tab-bar",
  title: "TabBar",
  group: "Your Agents",
  render: () => <TabBarSpecimen />,
};
