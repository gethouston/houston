import { PALETTE_WORDS } from "./color-vocabulary-palettes";
import { STATE_WORDS } from "./color-vocabulary-states";
import { SURFACE_WORDS } from "./color-vocabulary-surfaces";

export interface ColorWord {
  label: string;
  role: string;
}

export const COLOR_VOCABULARY: Record<string, ColorWord> = {
  ...SURFACE_WORDS,
  ...STATE_WORDS,
  ...PALETTE_WORDS,
};
