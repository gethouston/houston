import type { SpecimenProp } from "../../../src/specimen";

/**
 * `FormDialog`'s public API, read off `ui/core/src/components/form-dialog.tsx`.
 * Split out only to keep the specimen file inside the 200-line rule.
 */
export const formDialogProps: SpecimenProp[] = [
  {
    name: "open",
    type: "boolean",
    note: "Required. Controlled-only — the recipe renders no trigger.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "Required. Refused while the primary's promise is in flight.",
  },
  { name: "title", type: "string", note: "Required. The job, in one line." },
  {
    name: "description",
    type: "string",
    note: "Optional. Omitted rather than filled with filler.",
  },
  {
    name: "size",
    type: '"sm" | "md"',
    note: 'Default "md". sm:max-w-sm / sm:max-w-md. Wider means it is a flow.',
  },
  {
    name: "primary",
    type: "FormDialogAction",
    note: "Required. The verb, and the form's submit: Enter in any single-line field runs it. Async-aware: spinner, no re-entry, closes on resolve unless it resolved false.",
  },
  {
    name: "secondary",
    type: "FormDialogAction | null",
    note: "Default: the confirm's outline Cancel, which closes. With its own onClick it closes nothing. null renders the primary alone — the reveal posture, where the work already happened.",
  },
  {
    name: "labels",
    type: "{ cancel?: string; close?: string }",
    note: 'English defaults ("Cancel", "Close"); app/ passes t() results in.',
  },
  {
    name: "children",
    type: "ReactNode",
    note: "The fields, inside a real form. Stacked at gap-4 — pass inputs, not a layout. A textarea keeps its newline; Enter elsewhere submits.",
  },
  {
    name: "FormDialogAction.label",
    type: "string",
    note: "Required. Name the verb, never OK.",
  },
  {
    name: "FormDialogAction.onClick",
    type: "() => void | boolean | Promise<unknown>",
    note: "Return the promise. A rejection keeps the dialog open with its input; resolving false keeps it open on SUCCESS, for the step that reveals a minted secret.",
  },
  {
    name: "FormDialogAction.pendingLabel",
    type: "string",
    note: "Worn while the promise is in flight. Falls back to label.",
  },
  {
    name: "FormDialogAction.variant",
    type: '"default" | "destructive"',
    note: 'Default "default". The secondary stays outline unless it is destructive.',
  },
  {
    name: "FormDialogAction.disabled",
    type: "boolean",
    note: "For an invalid form. Refuses the click and Enter alike. Pending disables both buttons on its own.",
  },
];
