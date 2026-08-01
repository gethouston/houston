import { Button, ConfirmDialog } from "@houston-ai/core";
import { useState } from "react";

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
 * `ConfirmDialog` is controlled-only — it has no trigger of its own. Every row
 * therefore pairs one button with one instance, which is exactly how the app
 * uses it.
 */
function Confirm({
  label,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant,
  buttonVariant = "outline",
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  buttonVariant?: "default" | "destructive" | "outline" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <Button variant={buttonVariant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {confirmed && (
        <span className="text-[13px] text-ink-muted">Confirmed.</span>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        variant={variant}
        onConfirm={() => setConfirmed(true)}
      />
    </div>
  );
}

const props: SpecimenProp[] = [
  {
    name: "open",
    type: "boolean",
    note: "Required. The component is controlled-only — it renders no trigger.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "Required. Fires on Cancel, Escape and after Confirm.",
  },
  { name: "title", type: "string", note: "Required. The question." },
  {
    name: "description",
    type: "string",
    note: "Required. What confirming actually costs.",
  },
  {
    name: "confirmLabel",
    type: "string",
    note: 'Default "Delete". Name the verb, never "OK".',
  },
  { name: "cancelLabel", type: "string", note: 'Default "Cancel".' },
  {
    name: "variant",
    type: '"default" | "destructive"',
    note: 'Default "destructive". Styles the confirm Button.',
  },
  {
    name: "onConfirm",
    type: "() => void",
    note: "Required. Runs on confirm; the dialog closes itself.",
  },
];

function ConfirmDialogSpecimen() {
  return (
    <SpecimenPage
      title="ConfirmDialog"
      intro="The one-line wrapper over AlertDialog for the yes/no question. Title, description, two buttons — nothing to assemble."
    >
      <SpecimenSection
        title="Variants"
        note="`variant` styles the confirm button only. The cancel button is always AlertDialogCancel's outline."
      >
        <SpecimenRow label="destructive (default)">
          <Confirm
            label="Delete Inbox Zero"
            buttonVariant="destructive"
            title="Delete Inbox Zero?"
            description="Its 412 conversations and 3 schedules go with it. This cannot be undone."
          />
        </SpecimenRow>
        <SpecimenRow label="default">
          <Confirm
            label="Publish Meeting Notes"
            variant="default"
            confirmLabel="Publish"
            title="Publish Meeting Notes to the store?"
            description="Anyone with the link can install it. You can unpublish at any time."
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Confirming runs `onConfirm` and closes; the row reports back so the wiring is visible."
      >
        <SpecimenRow label="Closed">
          <Confirm
            label="Remove @julian"
            title="Remove @julian from this agent?"
            description="They lose access to Weekly Report immediately."
            confirmLabel="Remove"
          />
        </SpecimenRow>
        <SpecimenRow label="Custom labels">
          <Confirm
            label="Disconnect Gmail"
            title="Disconnect Gmail?"
            description="Inbox Zero stops triaging until you reconnect it."
            confirmLabel="Disconnect"
            cancelLabel="Keep connected"
          />
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <Button variant="outline" disabled>
            Delete Inbox Zero
          </Button>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-dialog",
          "bg-black/35",
          "text-ink-muted",
          "bg-danger",
          "bg-action",
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
export const sources: string[] = ["ConfirmDialog"];

export const specimen: Specimen = {
  id: "core-confirm-dialog",
  title: "ConfirmDialog",
  group: "Overlays",
  render: () => <ConfirmDialogSpecimen />,
};
