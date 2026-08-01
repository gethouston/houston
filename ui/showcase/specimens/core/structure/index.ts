import type { Specimen } from "../../../src/specimen";
import { specimen as accordion } from "./accordion";
import { specimen as carousel } from "./carousel";
import { specimen as collapsible } from "./collapsible";
import { specimen as modelPicker } from "./model-picker";
import { specimen as resizable } from "./resizable";
import { specimen as scrollArea } from "./scroll-area";
import { specimen as sidebar } from "./sidebar";
import { specimen as stepper } from "./stepper";
import { specimen as tabs } from "./tabs";

/**
 * The "Structure & nav" family: layout frames, panels, tabs, sidebars — anything
 * that positions content or routes between it.
 *
 * One file per component in this folder (`<component>.tsx`, each exporting
 * `export const specimen: Specimen` with `group: "Structure & nav"`), imported
 * here and listed below in nav order: the flat switchers first, then the frames
 * that hold a whole screen, then the composed pickers.
 */
export const specimens: readonly Specimen[] = [
  tabs,
  accordion,
  collapsible,
  scrollArea,
  resizable,
  sidebar,
  stepper,
  carousel,
  modelPicker,
];
