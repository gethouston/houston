import type { Specimen } from "../../../src/specimen";
import { specimen as accordion } from "./accordion";
import { specimen as carousel } from "./carousel";
import { specimen as collapsible } from "./collapsible";
import { specimen as modelPicker } from "./model-picker";
import { specimen as resizable } from "./resizable";
import { specimen as scrollArea } from "./scroll-area";
import { specimen as sidebar } from "./sidebar";
import { specimen as tabs } from "./tabs";

export const specimens: readonly Specimen[] = [
  tabs,
  accordion,
  collapsible,
  scrollArea,
  resizable,
  sidebar,
  carousel,
  modelPicker,
];
