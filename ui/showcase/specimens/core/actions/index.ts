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
