import type { SpecimenProp } from "../../../src/specimen";

/**
 * `AlertDialog`'s public API, read off `ui/core/src/components/alert-dialog.tsx`.
 * Split out only to keep the specimen file inside the 200-line rule.
 */
export const alertDialogProps: SpecimenProp[] = [
  { name: "AlertDialog.open", type: "boolean", note: "Controlled open state." },
  {
    name: "AlertDialog.defaultOpen",
    type: "boolean",
    note: "Uncontrolled initial state.",
  },
  {
    name: "AlertDialog.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on trigger, Cancel and Action.",
  },
  {
    name: "AlertDialogContent.size",
    type: '"default" | "sm"',
    note: 'Default "default". `sm` clamps to max-w-xs and grids the footer 2-up.',
  },
  {
    name: "AlertDialogAction.variant",
    type: "Button['variant']",
    note: 'Default "default". Use "destructive" for a delete.',
  },
  {
    name: "AlertDialogAction.size",
    type: "Button['size']",
    note: 'Default "default".',
  },
  {
    name: "AlertDialogCancel.variant",
    type: "Button['variant']",
    note: 'Default "outline".',
  },
  {
    name: "AlertDialogCancel.size",
    type: "Button['size']",
    note: 'Default "default".',
  },
  {
    name: "AlertDialogMedia",
    type: "React.ComponentProps<'div'>",
    note: "Optional 64px chip above (or beside) the title. Sizes its svg to 32px.",
  },
];
