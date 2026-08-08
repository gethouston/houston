import type { SidebarGroupView } from "@houston-ai/layout";
import { SidebarGroupHeader } from "@houston-ai/layout";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  GROUP_LABELS,
  SIDEBAR_GROUP_HEADER_PROPS,
} from "./sidebar-group-header-api";
import { LiveDraft, LiveGroup, Rail } from "./sidebar-group-header-parts";

const mornings: SidebarGroupView = {
  id: "mornings",
  name: "Mornings",
  collapsed: false,
  itemIds: ["inbox-zero", "meeting-notes"],
};

const finance: SidebarGroupView = {
  id: "finance",
  name: "Finance",
  collapsed: true,
  itemIds: ["weekly-report", "expense-filer", "contract-reader"],
};

function SidebarGroupHeaderSpecimen() {
  return (
    <SpecimenPage
      title="SidebarGroupHeader"
      intro="The quiet label over a named group of agents: a hairline chevron, the name, a muted count, and a ⋯ menu that only appears on hover."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop. What changes is which callbacks you pass: each of `onEditContext`, `onRenameGroup` and `onDeleteGroup` adds its own entry, and with none of them the ⋯ trigger is not rendered at all. A group may also narrow that per group, through its own `affordances` mask — how a server-owned team says the caller may rename it but not delete it. `onLeave` is the one entry that acts on the caller rather than the group, so it sits last, behind a separator, and needs `affordances.leave` set to true on top of the callback."
      >
        <SpecimenRow label="Full menu — hover for ⋯">
          <Rail>
            <LiveGroup initial={mornings} />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Masked — rename allowed, delete withheld, Leave offered">
          <Rail>
            <SidebarGroupHeader
              group={{
                ...mornings,
                affordances: { rename: true, delete: false, leave: true },
              }}
              count={mornings.itemIds.length}
              labels={GROUP_LABELS}
              onRenameGroup={() => {}}
              onDeleteGroup={() => {}}
              onLeave={() => {}}
            />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="No menu — read-only group">
          <Rail>
            <SidebarGroupHeader
              group={mornings}
              count={mornings.itemIds.length}
              labels={GROUP_LABELS}
            />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Collapse is the group's own `collapsed` flag — the chevron rotates 90°, it never disappears. Rename swaps the label for an input that focuses and selects once, commits on Enter or blur, and abandons on Escape. Every abandonment reports itself once through `onCancelRename` — Escape, or leaving the field with nothing typed or nothing changed — which is how a group that does not exist yet knows to disappear."
      >
        <SpecimenRow label="Expanded / collapsed — click a chevron">
          <Rail>
            <LiveGroup initial={mornings} />
            <LiveGroup initial={finance} />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Renaming — a just-created group opens here">
          <Rail>
            <LiveGroup
              initial={{
                id: "new-group",
                name: "Untitled",
                collapsed: false,
                itemIds: [],
              }}
              startRenaming
            />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Draft — name it to keep it, Escape to drop it">
          <Rail>
            <LiveDraft />
          </Rail>
        </SpecimenRow>
        <SpecimenRow label="Count fades under the hover menu">
          <Rail>
            <LiveGroup initial={finance} />
          </Rail>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={SIDEBAR_GROUP_HEADER_PROPS} />

      <SpecimenTokens
        classes={[
          "bg-hover",
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
