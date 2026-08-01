import {
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  Kbd,
  KbdGroup,
} from "@houston-ai/core";
import {
  BarChart3,
  FileText,
  Inbox,
  Plus,
  Settings,
  Upload,
} from "lucide-react";
import { useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { commandProps, commandTokens } from "./command-parts";

const AGENTS = [
  { name: "Inbox Zero", icon: Inbox },
  { name: "Meeting Notes", icon: FileText },
  { name: "Weekly Report", icon: BarChart3 },
];

/** The list every example on this page shares. */
function PaletteBody({ query }: { query: string }) {
  return (
    <CommandList>
      <CommandEmpty>No agent or command matches “{query}”.</CommandEmpty>
      <CommandGroup heading="Agents">
        {AGENTS.map(({ name, icon: Icon }) => (
          <CommandItem key={name} value={name}>
            <Icon />
            {name}
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Actions">
        <CommandItem value="New agent">
          <Plus />
          New agent
          <CommandShortcut>⌘N</CommandShortcut>
        </CommandItem>
        <CommandItem value="Publish to the store">
          <Upload />
          Publish to the store
        </CommandItem>
        <CommandItem value="Workspace settings" disabled>
          <Settings />
          Workspace settings
          <CommandShortcut>Admins only</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  );
}

/** Live: type in it. The frame is the page's, since Command paints no border. */
function Palette({ initial = "" }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  return (
    <Command className="w-80 max-w-full rounded-md border border-line">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search agents and commands"
      />
      <PaletteBody query={query} />
    </Command>
  );
}

/** The ⌘K form: the same list, in a dialog. */
function PaletteDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open the palette
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Search agents and commands"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search agents and commands"
        />
        <PaletteBody query={query} />
      </CommandDialog>
    </>
  );
}

function CommandSpecimen() {
  return (
    <SpecimenPage
      title="Command"
      intro="Type-to-find over anything: agents, actions, settings. cmdk's fuzzy filter, Houston's popover surface."
    >
      <SpecimenSection
        title="Variants"
        note="Two forms ship. `Command` embeds the list in a panel you already have; `CommandDialog` is the ⌘K palette: the same children, in a solid modal."
      >
        <SpecimenRow label="Inline">
          <Palette />
        </SpecimenRow>
        <SpecimenRow label="Dialog">
          <PaletteDialog />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Every example is live. Arrow keys move the selection, Enter runs it; the list caps at 300px and scrolls, so a long result set never pushes the input off screen."
      >
        <SpecimenRow label="Results">
          <Palette />
        </SpecimenRow>
        <SpecimenRow label="Filtered">
          <Palette initial="report" />
        </SpecimenRow>
        <SpecimenRow label="Empty">
          <Palette initial="payroll" />
        </SpecimenRow>
        <SpecimenRow label="Selected row">
          <span className="text-ink-muted text-sm">
            The row under the pointer or the caret takes the hover fill, the
            same fill a menu row takes, so the two never read as different
            surfaces. Hover the list above to see it.
          </span>
        </SpecimenRow>
        <SpecimenRow label="Disabled item">
          <span className="text-ink-muted text-sm">
            “Workspace settings” in each list is disabled: half opacity, skipped
            by the arrow keys, and it keeps its trailing note so the reason is
            visible rather than guessed.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={commandProps} />
      <SpecimenTokens classes={commandTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Command",
  "CommandDialog",
  "CommandEmpty",
  "CommandGroup",
  "CommandInput",
  "CommandItem",
  "CommandList",
  "CommandSeparator",
  "CommandShortcut",
];

export const specimen: Specimen = {
  id: "core-command",
  title: "Command",
  group: "Actions & inputs",
  render: () => <CommandSpecimen />,
};
