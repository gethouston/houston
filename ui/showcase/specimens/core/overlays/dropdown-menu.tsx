import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { CopyIcon, PencilIcon, ShareIcon, Trash2Icon } from "lucide-react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  ColumnsMenu,
  dropdownMenuProps,
  iconTrigger,
  Menu,
  SortMenu,
} from "./dropdown-menu-parts";

const props: SpecimenProp[] = dropdownMenuProps;

function DropdownMenuSpecimen() {
  return (
    <SpecimenPage
      title="DropdownMenu"
      intro="The actions menu behind a button. Every item is reachable by keyboard, and the submenu is portalled so WebKit cannot clip it."
    >
      <SpecimenSection
        title="Variants"
        note="`variant` on the item is the only style variant. The rest of the family is structural: labels, separators, indicators, submenus."
      >
        <SpecimenRow label="Items + shortcuts">
          <Menu trigger={iconTrigger}>
            <DropdownMenuLabel>Inbox Zero</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <PencilIcon />
                Rename
                <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CopyIcon />
                Duplicate
                <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </Menu>
        </SpecimenRow>
        <SpecimenRow label='variant="destructive"'>
          <Menu trigger={iconTrigger}>
            <DropdownMenuItem>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2Icon />
              Delete agent
            </DropdownMenuItem>
          </Menu>
        </SpecimenRow>
        <SpecimenRow label="inset">
          <Menu trigger={<Button variant="outline">Inset items</Button>}>
            <DropdownMenuLabel inset>Workspace</DropdownMenuLabel>
            <DropdownMenuItem inset>Personal</DropdownMenuItem>
            <DropdownMenuItem inset>Acme team</DropdownMenuItem>
          </Menu>
        </SpecimenRow>
        <SpecimenRow label="Checkbox items">
          <ColumnsMenu />
        </SpecimenRow>
        <SpecimenRow label="Radio items">
          <SortMenu />
        </SpecimenRow>
        <SpecimenRow label="Submenu">
          <Menu trigger={<Button variant="outline">Share</Button>}>
            <DropdownMenuItem>
              <ShareIcon />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Share with</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>@julian</DropdownMenuItem>
                <DropdownMenuItem>@felipe</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Everyone at Acme</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </Menu>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Focus follows the pointer and the arrow keys — hover styling and keyboard styling are the same rule."
      >
        <SpecimenRow label="Closed">
          <Menu trigger={iconTrigger}>
            <DropdownMenuItem>Rename</DropdownMenuItem>
          </Menu>
        </SpecimenRow>
        <SpecimenRow label="Disabled item">
          <Menu trigger={<Button variant="outline">Run</Button>}>
            <DropdownMenuItem>Run now</DropdownMenuItem>
            <DropdownMenuItem disabled>
              Run on schedule (connect Gmail first)
            </DropdownMenuItem>
          </Menu>
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled>
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Rename</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
  "DropdownMenu",
  "DropdownMenuCheckboxItem",
  "DropdownMenuContent",
  "DropdownMenuGroup",
  "DropdownMenuItem",
  "DropdownMenuLabel",
  "DropdownMenuRadioGroup",
  "DropdownMenuRadioItem",
  "DropdownMenuSeparator",
  "DropdownMenuShortcut",
  "DropdownMenuSub",
  "DropdownMenuSubContent",
  "DropdownMenuSubTrigger",
  "DropdownMenuTrigger",
];

export const specimen: Specimen = {
  id: "core-dropdown-menu",
  title: "DropdownMenu",
  group: "Overlays",
  render: () => <DropdownMenuSpecimen />,
};
