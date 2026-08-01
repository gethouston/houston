import type { Specimen } from "../../../src/specimen";
import { specimen as catalog } from "./catalog";
import { specimen as catalogDetailDialog } from "./catalog-detail-dialog";
import { specimen as catalogRow } from "./catalog-row";
import { specimen as catalogSearchField } from "./catalog-search-field";
import { specimen as catalogShell } from "./catalog-shell";

/**
 * The "Catalog" family: the flat catalog plane every browse surface is built
 * from — integrations, skills, AI providers, the agent store. Layout first
 * (the primitives, then the shell that arranges them), then the pieces that
 * fill it (the row and the modal a row opens), then the field that filters the
 * lot.
 *
 * One file per component in this folder (`<component>.tsx`, each exporting
 * `export const specimen: Specimen` with `group: "Catalog"`), imported here and
 * listed below in nav order. `sample.tsx` holds the family's shared sample
 * content; `<component>-parts.tsx` holds sections split out to keep a page
 * under the 200-line limit. The layout helpers live in `../../../src/specimen`.
 */
export const specimens: readonly Specimen[] = [
  catalog,
  catalogShell,
  catalogRow,
  catalogDetailDialog,
  catalogSearchField,
];
