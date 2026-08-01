import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@houston-ai/core";
import { type ReactNode, useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** One agent-settings sheet, parameterised by the prop under review. */
function SettingsSheet({
  trigger,
  side,
  showCloseButton,
}: {
  trigger: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side={side} showCloseButton={showCloseButton}>
        <SheetHeader>
          <SheetTitle>Inbox Zero</SheetTitle>
          <SheetDescription>
            Triages your mail every morning and drafts the replies you approve.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Controlled: the parent owns `open`, so the trigger can live anywhere. */
function ControlledSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open from outside
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Meeting Notes</SheetTitle>
            <SheetDescription>
              Joins the call, writes the summary, files the follow-ups.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

const props: SpecimenProp[] = [
  { name: "Sheet.open", type: "boolean", note: "Controlled open state." },
  {
    name: "Sheet.defaultOpen",
    type: "boolean",
    note: "Uncontrolled initial state.",
  },
  {
    name: "Sheet.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on trigger, Escape and outside click.",
  },
  {
    name: "Sheet.modal",
    type: "boolean",
    note: "Default true. False leaves the page behind it interactive.",
  },
  {
    name: "SheetContent.side",
    type: '"top" | "right" | "bottom" | "left"',
    note: 'Default "right". Left/right are 3/4 wide, capped at sm:max-w-sm; top/bottom hug their content.',
  },
  {
    name: "SheetContent.showCloseButton",
    type: "boolean",
    note: "Default true. The X in the top-right corner.",
  },
];

function SheetSpecimen() {
  return (
    <SpecimenPage
      title="Sheet"
      intro="The edge panel. Same modal semantics as Dialog, but it slides in from a side and keeps the page shape behind it."
    >
      <SpecimenSection
        title="Variants"
        note="`side` is the only structural variant, and it decides both the slide direction and the panel's axis."
      >
        <SpecimenRow label="right (default)">
          <SettingsSheet trigger={<Button>Open from right</Button>} />
        </SpecimenRow>
        <SpecimenRow label="left">
          <SettingsSheet
            side="left"
            trigger={<Button variant="outline">Open from left</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="top">
          <SettingsSheet
            side="top"
            trigger={<Button variant="outline">Open from top</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="bottom">
          <SettingsSheet
            side="bottom"
            trigger={<Button variant="outline">Open from bottom</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="No corner close">
          <SettingsSheet
            showCloseButton={false}
            trigger={<Button variant="ghost">Footer close only</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Open and closed, plus who owns that state. The open animation runs 500ms, the close 300ms."
      >
        <SpecimenRow label="Closed">
          <SettingsSheet trigger={<Button>Agent settings</Button>} />
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <SettingsSheet trigger={<Button disabled>Agent settings</Button>} />
        </SpecimenRow>
        <SpecimenRow label="Controlled">
          <ControlledSheet />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-dialog",
          "bg-black/35",
          "text-ink",
          "text-ink-muted",
          "ring-offset-input",
          "focus:ring-focus",
          "data-[state=open]:bg-chip",
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
  "Sheet",
  "SheetClose",
  "SheetContent",
  "SheetDescription",
  "SheetFooter",
  "SheetHeader",
  "SheetTitle",
  "SheetTrigger",
];

export const specimen: Specimen = {
  id: "core-sheet",
  title: "Sheet",
  group: "Overlays",
  render: () => <SheetSpecimen />,
};
