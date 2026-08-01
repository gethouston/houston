import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { MoreHorizontalIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";

/** The shell every row on the specimen page opens: one trigger, one content. */
export function Menu({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The overflow button an agent row carries in the product. */
export const iconTrigger = (
  <Button variant="outline" size="icon" aria-label="Agent actions">
    <MoreHorizontalIcon />
  </Button>
);

/** Checkbox items keep the menu open, so they need real state to be honest. */
export function ColumnsMenu() {
  const [showRuns, setShowRuns] = useState(true);
  const [showOwner, setShowOwner] = useState(false);
  return (
    <Menu trigger={<Button variant="outline">Columns</Button>}>
      <DropdownMenuLabel>Show columns</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={showRuns}
        onCheckedChange={setShowRuns}
      >
        Last run
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={showOwner}
        onCheckedChange={setShowOwner}
      >
        Owner
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked disabled>
        Agent name
      </DropdownMenuCheckboxItem>
    </Menu>
  );
}

/** Radio items are single-choice, so they need the same. */
export function SortMenu() {
  const [sort, setSort] = useState("recent");
  return (
    <Menu trigger={<Button variant="outline">Sort</Button>}>
      <DropdownMenuLabel inset>Sort agents by</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
        <DropdownMenuRadioItem value="recent">
          Most recent
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="installs">Installs</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </Menu>
  );
}

/**
 * `DropdownMenu`'s public API, read off
 * `ui/core/src/components/dropdown-menu.tsx`. Split out only to keep the
 * specimen file inside the 200-line rule.
 */
export const dropdownMenuProps: SpecimenProp[] = [
  {
    name: "DropdownMenu.open",
    type: "boolean",
    note: "Controlled open state.",
  },
  {
    name: "DropdownMenu.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on trigger, Escape, outside click and item select.",
  },
  {
    name: "DropdownMenuContent.sideOffset",
    type: "number",
    note: "Default 4. Gap in px between trigger and content.",
  },
  {
    name: "DropdownMenuContent.align",
    type: '"start" | "center" | "end"',
    note: 'Default "center". The content scrolls at the available height.',
  },
  {
    name: "DropdownMenuItem.variant",
    type: '"default" | "destructive"',
    note: 'Default "default". Destructive paints text and icon danger.',
  },
  {
    name: "DropdownMenuItem.inset",
    type: "boolean",
    note: "Pads the item to the indicator column, so it lines up with checkboxes.",
  },
  {
    name: "DropdownMenuItem.disabled",
    type: "boolean",
    note: "Drops to 50% and stops receiving pointer events.",
  },
  {
    name: "DropdownMenuItem.onSelect",
    type: "(event: Event) => void",
    note: "Closes the menu unless you preventDefault().",
  },
  {
    name: "DropdownMenuCheckboxItem.checked",
    type: "boolean | 'indeterminate'",
    note: "Renders a check in the indicator column.",
  },
  {
    name: "DropdownMenuRadioGroup.value",
    type: "string",
    note: "The selected `DropdownMenuRadioItem.value`.",
  },
  {
    name: "DropdownMenuLabel.inset",
    type: "boolean",
    note: "Same indicator-column padding, for group headings.",
  },
  {
    name: "DropdownMenuSubTrigger.inset",
    type: "boolean",
    note: "Same padding. The chevron is appended by the component.",
  },
  {
    name: "DropdownMenuShortcut",
    type: "React.ComponentProps<'span'>",
    note: "Right-aligned muted keycap text. Purely decorative — bind the key yourself.",
  },
];
