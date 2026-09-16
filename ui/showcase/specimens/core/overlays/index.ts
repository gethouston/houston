import type { Specimen } from "../../../src/specimen";
import { specimen as alertDialog } from "./alert-dialog";
import { specimen as confirmDialog } from "./confirm-dialog";
import { specimen as contextMenu } from "./context-menu";
import { specimen as dialog } from "./dialog";
import { specimen as dropdownMenu } from "./dropdown-menu";
import { specimen as flowChoiceRow } from "./flow-choice-row";
import { specimen as flowSheet } from "./flow-sheet";
import { specimen as formDialog } from "./form-dialog";
import { specimen as hoverCard } from "./hover-card";
import { specimen as popover } from "./popover";
import { specimen as sheet } from "./sheet";
import { specimen as sonner } from "./sonner";
import { specimen as toastContainer } from "./toast-container";
import { specimen as tooltip } from "./tooltip";

/**
 * The "Overlays" family: dialogs, sheets, popovers, menus, tooltips and the two
 * toast stacks — anything that floats above the page. Every one of them renders
 * a live trigger that actually opens, with the single exception documented on
 * the sonner page (firing a sonner toast needs the `sonner` package itself,
 * which the showcase does not depend on).
 *
 * One file per component in this folder (`<component>.tsx`, each exporting
 * `export const specimen: Specimen` with `group: "Overlays"`), imported here
 * and listed below in nav order. The layout helpers live in
 * `../../../src/specimen`.
 *
 * Nav order is weight order: the modal surfaces first (they interrupt), then
 * the anchored panels, then the menus, then the transient notifications. The
 * recipes follow the primitives they are built from — FormDialog and FlowSheet
 * after the dialogs, and the choice grammar that fills a flow's first step
 * after FlowSheet.
 */
export const specimens: readonly Specimen[] = [
  dialog,
  alertDialog,
  confirmDialog,
  formDialog,
  flowSheet,
  flowChoiceRow,
  sheet,
  popover,
  hoverCard,
  tooltip,
  dropdownMenu,
  contextMenu,
  toastContainer,
  sonner,
];
