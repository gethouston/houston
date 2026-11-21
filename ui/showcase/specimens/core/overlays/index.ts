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
