// `context-menu` is the one overlay `ui/core/src/index.ts` does not re-export,
// so it is reached by package path — the same way `globals.css` reaches into
// `@houston-ai/core/src`. Add the barrel line and this becomes a plain import.
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@houston-ai/core/src/components/context-menu";
import { CopyIcon, PencilIcon, PlayIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/**
 * The right-click surface. A context menu is never the only path to an action,
 * so every item here also exists in the agent's DropdownMenu.
 */
function AgentCard({
  name,
  meta,
  children,
}: {
  name: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-24 w-56 select-none flex-col justify-end rounded-2xl border border-line border-dashed bg-card p-4">
        <span className="font-medium text-[15px] text-ink">{name}</span>
        <span className="text-[13px] text-ink-muted">{meta}</span>
      </ContextMenuTrigger>
      <ContextMenuContent>{children}</ContextMenuContent>
    </ContextMenu>
  );
}

const props: SpecimenProp[] = [
  {
    name: "ContextMenu.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on right-click, Escape and outside click.",
  },
  {
    name: "ContextMenu.modal",
    type: "boolean",
    note: "Default true. False leaves the page behind it scrollable.",
  },
  {
    name: "ContextMenuTrigger.disabled",
    type: "boolean",
    note: "Lets the browser's own context menu through instead.",
  },
  {
    name: "ContextMenuItem.variant",
    type: '"default" | "destructive"',
    note: 'Default "default". Destructive paints text and icon danger.',
  },
  {
    name: "ContextMenuItem.disabled",
    type: "boolean",
    note: "Drops to 50% and stops receiving pointer events.",
  },
  {
    name: "ContextMenuItem.onSelect",
    type: "(event: Event) => void",
    note: "Closes the menu unless you preventDefault().",
  },
  {
    name: "ContextMenuSeparator",
    type: "React.ComponentProps<typeof ContextMenu.Separator>",
    note: "One hairline rule, bled to the content's padding.",
  },
];

function ContextMenuSpecimen() {
  return (
    <SpecimenPage
      title="ContextMenu"
      intro="Right-click on an agent card. It is a shortcut for people who expect one, never the only route to an action."
    >
      <SpecimenSection
        title="Variants"
        note="`variant` on the item is the only style variant. Right-click any card below to open its menu."
      >
        <SpecimenRow label='variant="default"'>
          <AgentCard name="Inbox Zero" meta="Right-click me">
            <ContextMenuItem>
              <PlayIcon />
              Run now
            </ContextMenuItem>
            <ContextMenuItem>
              <PencilIcon />
              Rename
            </ContextMenuItem>
            <ContextMenuItem>
              <CopyIcon />
              Duplicate
            </ContextMenuItem>
          </AgentCard>
        </SpecimenRow>
        <SpecimenRow label='variant="destructive"'>
          <AgentCard name="Meeting Notes" meta="Right-click me">
            <ContextMenuItem>
              <PencilIcon />
              Rename
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive">
              <Trash2Icon />
              Delete agent
            </ContextMenuItem>
          </AgentCard>
        </SpecimenRow>
        <SpecimenRow label="With separator">
          <AgentCard name="Weekly Report" meta="Right-click me">
            <ContextMenuItem>Run now</ContextMenuItem>
            <ContextMenuItem>Open last run</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>Copy share link</ContextMenuItem>
          </AgentCard>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Focus follows the pointer and the arrow keys. A disabled item stays visible so the menu's shape never shifts."
      >
        <SpecimenRow label="Closed">
          <AgentCard name="Expense Filer" meta="Right-click me">
            <ContextMenuItem>Run now</ContextMenuItem>
          </AgentCard>
        </SpecimenRow>
        <SpecimenRow label="Disabled item">
          <AgentCard name="Contract Reader" meta="Right-click me">
            <ContextMenuItem>Run now</ContextMenuItem>
            <ContextMenuItem disabled>
              Share (only owners can share)
            </ContextMenuItem>
          </AgentCard>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-popover",
          "text-popover-text",
          "focus:bg-hover",
          "focus:text-hover-text",
          "text-danger",
          "focus:bg-danger/10",
          "bg-line",
          "text-ink-muted",
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
export const sources: string[] = [
  "ContextMenu",
  "ContextMenuContent",
  "ContextMenuItem",
  "ContextMenuSeparator",
  "ContextMenuTrigger",
];

export const specimen: Specimen = {
  id: "core-context-menu",
  title: "ContextMenu",
  group: "Overlays",
  render: () => <ContextMenuSpecimen />,
};
