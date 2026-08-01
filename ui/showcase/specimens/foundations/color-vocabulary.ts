import { PALETTE_WORDS } from "./color-vocabulary-palettes";
import { STATE_WORDS } from "./color-vocabulary-states";
import { SURFACE_WORDS } from "./color-vocabulary-surfaces";

/** What a `--ht-*` token is CALLED, and what it is FOR. */
export interface ColorWord {
  /** The plain-English name, e.g. `Gutter` for `--ht-base`. */
  label: string;
  /** One sentence a non-technical reviewer can act on. */
  role: string;
}

/**
 * The curated half of this page.
 *
 * The token NAMES are read from the design-token JSON, so the page can never
 * fall behind the palette. The words are written by hand, here, because
 * "`--ht-base` is the gutter the sidebar melts into" is a design decision, not
 * something a build step can derive. A token with no entry still renders — it
 * falls back to its prettified name and says so — so the list growing is a
 * prompt to write a sentence, never a page that silently drops a colour.
 *
 * Split across three files purely for size: surfaces and ink, then the state
 * families, then the two feature palettes.
 */
export const COLOR_VOCABULARY: Record<string, ColorWord> = {
  ...SURFACE_WORDS,
  ...STATE_WORDS,
  ...PALETTE_WORDS,
};
