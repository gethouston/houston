import type { SpecimenProp } from "../../../src/specimen";

/**
 * `Dialog`'s public API, read off `ui/core/src/components/dialog.tsx`. Split
 * out only to keep the specimen file inside the 200-line rule.
 */
export const dialogProps: SpecimenProp[] = [
  { name: "Dialog.open", type: "boolean", note: "Controlled open state." },
  {
    name: "Dialog.defaultOpen",
    type: "boolean",
    note: "Uncontrolled initial state.",
  },
  {
    name: "Dialog.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on trigger, Escape and outside click.",
  },
  {
    name: "Dialog.modal",
    type: "boolean",
    note: "Default true. False leaves the page behind it interactive.",
  },
  {
    name: "DialogContent.showCloseButton",
    type: "boolean",
    note: "Default true. The X in the top-right corner.",
  },
  {
    name: "DialogContent.closeLabel",
    type: "string",
    note: 'Default "Close". Screen-reader label for that X.',
  },
  {
    name: "DialogFooter.showCloseButton",
    type: "boolean",
    note: "Default false. Appends an outline Button that closes.",
  },
  {
    name: "DialogFooter.closeLabel",
    type: "string",
    note: 'Default "Close". Visible label for that button.',
  },
];
