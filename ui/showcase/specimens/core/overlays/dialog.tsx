import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
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
import { HeaderCloseDialog } from "./dialog-header-close";
import { dialogProps } from "./dialog-parts";

function RenameDialog({
  trigger,
  showCloseButton,
  modal,
}: {
  trigger: ReactNode;
  showCloseButton?: boolean;
  modal?: boolean;
}) {
  return (
    <Dialog modal={modal}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={showCloseButton}>
        <DialogHeader>
          <DialogTitle>Rename agent</DialogTitle>
          <DialogDescription>
            Inbox Zero keeps every conversation and schedule it already has.
          </DialogDescription>
        </DialogHeader>
        <Input defaultValue="Inbox Zero" aria-label="Agent name" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save name</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FooterCloseDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">What Inbox Zero can see</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Connected accounts</DialogTitle>
          <DialogDescription>
            Inbox Zero reads Gmail and writes drafts. It never sends without
            your approval.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton closeLabel="Got it" />
      </DialogContent>
    </Dialog>
  );
}

function ControlledDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open from outside
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meeting Notes is ready</DialogTitle>
            <DialogDescription>
              It joined 3 calls this week and filed 12 follow-ups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const props: SpecimenProp[] = dialogProps;

function DialogSpecimen() {
  return (
    <SpecimenPage
      title="Dialog"
      intro="The modal surface. Solid in both themes — it sits over arbitrary content and must never bleed it through."
    >
      <SpecimenSection
        title="Variants"
        note="Dialog has no style variants. What varies is which close affordance the content carries."
      >
        <SpecimenRow label="Corner close (default)">
          <RenameDialog trigger={<Button>Rename Inbox Zero</Button>} />
        </SpecimenRow>
        <SpecimenRow label="No corner close">
          <RenameDialog
            showCloseButton={false}
            trigger={<Button variant="outline">Rename Inbox Zero</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="Footer close button">
          <FooterCloseDialog />
        </SpecimenRow>
        <SpecimenRow label="Header close (DialogCloseButton)">
          <HeaderCloseDialog />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Open and closed are the whole state machine; the trigger carries the rest."
      >
        <SpecimenRow label="Closed">
          <RenameDialog trigger={<Button>Rename Inbox Zero</Button>} />
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <RenameDialog trigger={<Button disabled>Rename Inbox Zero</Button>} />
        </SpecimenRow>
        <SpecimenRow label="Controlled">
          <ControlledDialog />
        </SpecimenRow>
        <SpecimenRow label="Non-modal">
          <RenameDialog
            modal={false}
            trigger={<Button variant="ghost">Rename Inbox Zero</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-dialog",
          "border-line",
          "bg-black/25",
          "text-ink-muted",
          "hover:bg-hover",
          "hover:text-ink",
        ]}
      />
    </SpecimenPage>
  );
}

export const sources: string[] = [
  "Dialog",
  "DialogClose",
  "DialogContent",
  "DialogDescription",
  "DialogFooter",
  "DialogHeader",
  "DialogTitle",
  "DialogTrigger",
];

export const specimen: Specimen = {
  id: "core-dialog",
  title: "Dialog",
  group: "Overlays",
  render: () => <DialogSpecimen />,
};
