import type { Specimen } from "../../../src/specimen";
import { specimen as asyncButton } from "./async-button";
import { specimen as button } from "./button";
import { specimen as buttonGroup } from "./button-group";
import { specimen as command } from "./command";
import { specimen as input } from "./input";
import { specimen as inputGroup } from "./input-group";
import { specimen as inputOtp } from "./input-otp";
import { specimen as kbd } from "./kbd";
import { specimen as select } from "./select";
import { specimen as switchSpecimen } from "./switch";
import { specimen as textarea } from "./textarea";

/**
 * The "Actions & inputs" family: buttons, inputs, selects, toggles, sliders —
 * anything the user acts through.
 *
 * One file per component in this folder (`<component>.tsx`, each exporting
 * `export const specimen: Specimen` with `group: "Actions & inputs"`), imported
 * here and listed below in nav order. The layout helpers live in
 * `../../../src/specimen`.
 *
 * Nav order runs buttons, then fields, then the choices and surfaces built out
 * of them, so a page never depends on one further down the list.
 */
export const specimens: readonly Specimen[] = [
  button,
  asyncButton,
  buttonGroup,
  input,
  inputGroup,
  inputOtp,
  textarea,
  select,
  switchSpecimen,
  command,
  kbd,
];
