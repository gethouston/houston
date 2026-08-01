import type { Specimen } from "../../src/specimen";
import { specimen as colors } from "./colors";

/**
 * **Foundations**: the decisions every component page downstream is an
 * application of. Colour first — it is the one a reviewer checks before
 * judging anything built on it, and it is the showcase's landing page.
 *
 * Unlike the component families, a foundations page documents the design
 * system itself rather than a `@houston-ai/*` export, so it carries an empty
 * `sources` list (see the note in `colors.tsx`).
 */
export const specimens: readonly Specimen[] = [colors];
