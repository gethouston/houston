import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@houston-ai/core";
import { TrashIcon } from "lucide-react";
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
import { alertDialogProps } from "./alert-dialog-parts";

/**
 * One delete confirmation, parameterised by the prop each row is presenting.
 * `AlertDialogAction` and `AlertDialogCancel` render a `Button`, so they take
 * its `variant` and `size` directly.
 */
function DeleteAlert({
  trigger,
  size,
  actionVariant = "destructive",
  media,
}: {
  trigger: ReactNode;
  size?: "default" | "sm";
  actionVariant?: "default" | "destructive" | "outline" | "secondary";
  media?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent size={size}>
        <AlertDialogHeader>
          {media && (
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>Delete Inbox Zero?</AlertDialogTitle>
          <AlertDialogDescription>
            Its 412 conversations and 3 schedules go with it. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant={actionVariant}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Controlled: the parent owns `open`, so the trigger can live anywhere. */
function ControlledAlert() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open from outside
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Weekly Report?</AlertDialogTitle>
            <AlertDialogDescription>
              It is mid-run. Stopping now discards this week's draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Let it finish</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Stop</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const props: SpecimenProp[] = alertDialogProps;

function AlertDialogSpecimen() {
  return (
    <SpecimenPage
      title="AlertDialog"
      intro="The interrupting confirmation: no corner close, no outside dismiss. The user has to answer it."
    >
      <SpecimenSection
        title="Variants"
        note="`AlertDialogAction` and `AlertDialogCancel` forward Button's `variant`; the header re-lays itself out when it carries media."
      >
        <SpecimenRow label="Destructive action (default)">
          <DeleteAlert
            trigger={<Button variant="destructive">Delete</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="Default action">
          <DeleteAlert
            actionVariant="default"
            trigger={<Button>Delete</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="Cancel variant: secondary">
          <DeleteAlert
            actionVariant="secondary"
            trigger={<Button variant="outline">Delete</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="With media">
          <DeleteAlert
            media
            trigger={<Button variant="destructive">Delete with icon</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Escape and an outside click are both inert here — that is the point of the component."
      >
        <SpecimenRow label="Closed">
          <DeleteAlert
            trigger={<Button variant="destructive">Delete</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <DeleteAlert
            trigger={
              <Button variant="destructive" disabled>
                Delete
              </Button>
            }
          />
        </SpecimenRow>
        <SpecimenRow label="Controlled">
          <ControlledAlert />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="`size` on the content. `sm` clamps to max-w-xs, keeps the header centred and grids the footer into two equal columns."
      >
        <SpecimenRow label="default">
          <DeleteAlert
            size="default"
            trigger={<Button variant="outline">size="default"</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="sm">
          <DeleteAlert
            size="sm"
            trigger={<Button variant="outline">size="sm"</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-dialog",
          "bg-black/35",
          "bg-chip-subtle",
          "text-ink-muted",
          "border",
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
  "AlertDialog",
  "AlertDialogAction",
  "AlertDialogCancel",
  "AlertDialogContent",
  "AlertDialogDescription",
  "AlertDialogFooter",
  "AlertDialogHeader",
  "AlertDialogMedia",
  "AlertDialogTitle",
  "AlertDialogTrigger",
];

export const specimen: Specimen = {
  id: "core-alert-dialog",
  title: "AlertDialog",
  group: "Overlays",
  render: () => <AlertDialogSpecimen />,
};
